/**
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

/**
 * @fileoverview The entry point for rendering the Lighthouse report based on the JSON output.
 *    This file is injected into the report HTML along with the JSON report.
 *
 * Dummy text for ensuring report robustness: </script> pre$`post %%LIGHTHOUSE_JSON%%
 */

/* globals DOM, DetailsRenderer, Logger */

const RATINGS = {
  PASS: {label: 'pass', minScore: 75},
  AVERAGE: {label: 'average', minScore: 45},
  FAIL: {label: 'fail'}
};

/**
 * Convert a score to a rating label.
 * @param {number} score
 * @return {string}
 */
function calculateRating(score) {
  let rating = RATINGS.FAIL.label;
  if (score >= RATINGS.PASS.minScore) {
    rating = RATINGS.PASS.label;
  } else if (score >= RATINGS.AVERAGE.minScore) {
    rating = RATINGS.AVERAGE.label;
  }
  return rating;
}

/**
 * Format number.
 * @param {number} number
 * @return {string}
 */
function formatNumber(number) {
  return number.toLocaleString(undefined, {maximumFractionDigits: 1});
}

/**
 * Format time.
 * @param {string} date
 * @return {string}
 */
function formatDateTime(date) {
  const options = {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: 'numeric', timeZoneName: 'short'
  };
  let formatter = new Intl.DateTimeFormat('en-US', options);

  // Force UTC if runtime timezone could not be detected.
  // See https://github.com/GoogleChrome/lighthouse/issues/1056
  const tz = formatter.resolvedOptions().timeZone;
  if (!tz || tz.toLowerCase() === 'etc/unknown') {
    options.timeZone = 'UTC';
    formatter = new Intl.DateTimeFormat('en-US', options);
  }
  return formatter.format(new Date(date));
}


class LighthouseReportFunctionality {

  /**
   * @param {!Document} document
   * @param {ReportJSON=} report
   */
  constructor(document, report) {
    this.json = report || null;
    this._document = document;
    this._copyAttempt = false;

    this.onCopy = this.onCopy.bind(this);
    this.onExportButtonClick = this.onExportButtonClick.bind(this);
    this.onExport = this.onExport.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.printShortCutDetect = this.printShortCutDetect.bind(this);

    this.logger = new Logger(this._document.querySelector('#lighthouse-log'));

    this._addEventListeners();
  }

  _addEventListeners() {
    this._setUpCollaspeDetailsAfterPrinting();

    this.exportButton = this._document.querySelector('.lighthouse-export__button');
    if (this.exportButton) {
      this.exportButton.addEventListener('click', this.onExportButtonClick);
      const dropdown = this._document.querySelector('.lighthouse-export__dropdown');
      dropdown.addEventListener('click', this.onExport);

      this._document.addEventListener('copy', this.onCopy);
    }
    this._document.addEventListener('keydown', this.printShortCutDetect);
  }

  /**
   * Handler copy events.
   */
  onCopy(e) {
    // Only handle copy button presses (e.g. ignore the user copying page text).
    if (this._copyAttempt) {
      // We want to write our own data to the clipboard, not the user's text selection.
      e.preventDefault();
      e.clipboardData.setData('text/plain', JSON.stringify(this.json, null, 2));
      this.logger.log('Report JSON copied to clipboard');
    }

    this._copyAttempt = false;
  }

  /**
   * Copies the report JSON to the clipboard (if supported by the browser).
   */
  onCopyButtonClick() {
    if (window.ga) {
      window.ga('send', 'event', 'report', 'copy');
    }

    try {
      if (this._document.queryCommandSupported('copy')) {
        this._copyAttempt = true;

        // Note: In Safari 10.0.1, execCommand('copy') returns true if there's
        // a valid text selection on the page. See http://caniuse.com/#feat=clipboard.
        const successful = this._document.execCommand('copy');
        if (!successful) {
          this._copyAttempt = false; // Prevent event handler from seeing this as a copy attempt.
          this.logger.warn('Your browser does not support copy to clipboard.');
        }
      }
    } catch (err) {
      this._copyAttempt = false;
      this.logger.log(err.message);
    }
  }

  closeExportDropdown() {
    this.exportButton.classList.remove('active');
  }

  /**
   * Click handler for export button.
   */
  onExportButtonClick(e) {
    e.preventDefault();
    e.target.classList.toggle('active');
    this._document.addEventListener('keydown', this.onKeyDown);
  }

  /**
   * Handler for "export as" button.
   */
  onExport(e) {
    e.preventDefault();

    if (!e.target.dataset.action) {
      return;
    }

    switch (e.target.dataset.action) {
      case 'copy':
        this.onCopyButtonClick();
        break;
      case 'open-viewer':
        this.sendJSONReport();
        break;
      case 'print':
        this.expandDetailsWhenPrinting();
        window.print();
        break;
      case 'save-json': {
        const jsonStr = JSON.stringify(this.json, null, 2);
        this._saveFile(new Blob([jsonStr], {type: 'application/json'}));
        break;
      }
      case 'save-html': {
        let htmlStr = '';

        // Since Viewer generates its page HTML dynamically from report JSON,
        // run the ReportGenerator. For everything else, the page's HTML is
        // already the final product.
        // if (e.target.dataset.context !== 'viewer') {
        //   htmlStr = this._document.documentElement.outerHTML;
        // } else {
        //   const reportGenerator = new ReportGeneratorV2();
        //   htmlStr = reportGenerator.generateReportHTML(this.json);
        // }
        // TODO: fix viewer.
        htmlStr = this._document.documentElement.outerHTML;

        try {
          this._saveFile(new Blob([htmlStr], {type: 'text/html'}));
        } catch (err) {
          this.logger.error('Could not export as HTML. ' + err.message);
        }
        break;
      }
    }

    this.closeExportDropdown();
    this._document.removeEventListener('keydown', this.onKeyDown);
  }

  /**
   * Keydown handler for the document.
   */
  onKeyDown(e) {
    if (e.keyCode === 27) { // ESC
      this.closeExportDropdown();
    }
  }

  /**
   * Opens a new tab to the online viewer and sends the local page's JSON results
   * to the online viewer using postMessage.
   */
  sendJSONReport() {
    const VIEWER_ORIGIN = 'https://googlechrome.github.io';
    const VIEWER_URL = `${VIEWER_ORIGIN}/lighthouse/viewer/`;

    // Chrome doesn't allow us to immediately postMessage to a popup right
    // after it's created. Normally, we could also listen for the popup window's
    // load event, however it is cross-domain and won't fire. Instead, listen
    // for a message from the target app saying "I'm open".
    window.addEventListener('message', function msgHandler(e) {
      if (e.origin !== VIEWER_ORIGIN) {
        return;
      }

      if (e.data.opened) {
        popup.postMessage({lhresults: this.json}, VIEWER_ORIGIN);
        window.removeEventListener('message', msgHandler);
      }
    }.bind(this));

    const popup = window.open(VIEWER_URL, '_blank');
  }

  /**
   * Expands details while user using short cut to print report
   */
  printShortCutDetect(e) {
    if ((e.ctrlKey || e.metaKey) && e.keyCode === 80) { // Ctrl+P
      this.expandDetailsWhenPrinting();
    }
  }

  /**
   * Expands audit `<details>` when the user prints the page.
   * Ideally, a print stylesheet could take care of this, but CSS has no way to
   * open a `<details>` element.
   */
  expandDetailsWhenPrinting() {
    const reportContainer = this._document.querySelector('.lighthouse-categories');
    const details = Array.from(reportContainer.querySelectorAll('details'));
    details.map(detail => detail.open = true);
  }

  /**
   * Sets up listeners to collapse audit `<details>` when the user closes the
   * print dialog, all `<details>` are collapsed.
   */
  _setUpCollaspeDetailsAfterPrinting() {
    const details = Array.from(this._document.querySelectorAll('details'));

    // FF and IE implement these old events.
    if ('onbeforeprint' in window) {
      window.addEventListener('afterprint', _ => {
        details.map(detail => detail.open = false);
      });
    } else {
      // Note: while FF has media listeners, it doesn't fire when matching 'print'.
      window.matchMedia('print').addListener(mql => {
        if (!mql.matches) {
          details.map(detail => detail.open = mql.matches);
        }
      });
    }
  }
  /**
   * Downloads a file (blob) using a[download].
   * @param {Blob|File} blob The file to save.
   */
  _saveFile(blob) {
    const filename = window.getFilenamePrefix({
      url: this.json.url,
      generatedTime: this.json.generatedTime
    });

    const ext = blob.type.match('json') ? '.json' : '.html';

    const a = document.createElement('a');
    a.download = `${filename}${ext}`;
    a.href = URL.createObjectURL(blob);
    this._document.body.appendChild(a); // Firefox requires anchor to be in the DOM.
    a.click();

    // cleanup.
    this._document.body.removeChild(a);
    setTimeout(_ => URL.revokeObjectURL(a.href), 500);
  }
}

class ReportRenderer {
  /**
   * @param {!Document} document
   */
  constructor(document) {
    this._dom = new DOM(document);
    this._detailsRenderer = new DetailsRenderer(this._dom);
  }

  /**
   * @param {!ReportJSON} report
   * @param {!Element} container Parent element to render the report into.
   */
  renderReport(report, container) {
    container.innerHTML = ''; // Remove previous report.

    try {
      container.appendChild(this._renderReport(report));

      // Hook in JS features and add page-level event listeners after the report
      // has been added to the document.
      new LighthouseReportFunctionality(this._document, report);
    } catch (e) {
      container.appendChild(this._renderException(e));
    }
  }

  /**
   * @param {!DocumentFragment|!Element} element DOM node to populate with values.
   * @param {number} score
   * @param {string} scoringMode
   * @param {string} title
   * @param {string} description
   * @return {!Element}
   */
  _populateScore(element, score, scoringMode, title, description) {
    // Fill in the blanks.
    const valueEl = element.querySelector('.lh-score__value');
    valueEl.textContent = formatNumber(score);
    valueEl.classList.add(`lh-score__value--${calculateRating(score)}`,
                          `lh-score__value--${scoringMode}`);

    element.querySelector('.lh-score__title').textContent = title;
    element.querySelector('.lh-score__description')
        .appendChild(this._dom.createSpanFromMarkdown(description));

    return element;
  }

  /**
   * @param {!AuditJSON} audit
   * @return {!Element}
   */
  _renderAuditScore(audit) {
    const tmpl = this._dom.cloneTemplate('#tmpl-lh-audit-score');

    const scoringMode = audit.result.scoringMode;
    const description = audit.result.helpText;
    let title = audit.result.description;

    if (audit.result.displayValue) {
      title += `:  ${audit.result.displayValue}`;
    }
    if (audit.result.optimalValue) {
      title += ` (target: ${audit.result.optimalValue})`;
    }

    // Append audit details to header section so the entire audit is within a <details>.
    const header = tmpl.querySelector('.lh-score__header');
    header.open = audit.score < 100; // expand failed audits
    if (audit.result.details) {
      header.appendChild(this._detailsRenderer.render(audit.result.details));
    }

    return this._populateScore(tmpl, audit.score, scoringMode, title, description);
  }

  /**
   * @param {!CategoryJSON} category
   * @return {!Element}
   */
  _renderCategoryScore(category) {
    const tmpl = this._dom.cloneTemplate('#tmpl-lh-category-score');
    const score = Math.round(category.score);
    return this._populateScore(tmpl, score, 'numeric', category.name, category.description);
  }

  /**
   * @param {!Error} e
   * @return {!Element}
   */
  _renderException(e) {
    const element = this._dom.createElement('div', 'lh-exception');
    element.textContent = String(e.stack);
    return element;
  }

  /**
   * @param {!ReportJSON} report
   * @return {!DocumentFragment}
   */
  _renderReportHeader(report) {
    const header = this._dom.cloneTemplate('#tmpl-lighthouse-heading');
    header.querySelector('.lighthouse-config__timestamp').textContent =
        formatDateTime(report.generatedTime);
    const url = header.querySelector('.lighthouse-metadata__url');
    url.href = report.url;
    url.textContent = report.url;

    const env = header.querySelector('.lighthouse-env__items');
    report.runtimeConfig.environment.forEach(runtime => {
      const item = this._dom.cloneTemplate('#tmpl-lighthouse-env__items', env);
      item.querySelector('.lighthouse-env__name').textContent = runtime.name;
      item.querySelector('.lighthouse-env__description').textContent = runtime.description;
      item.querySelector('.lighthouse-env__enabled').textContent =
          runtime.enabled ? 'Enabled' : 'Disabled';
      env.appendChild(item);
    });

    return header;
  }

  /**
   * @param {!ReportJSON} report
   * @return {!DocumentFragment}
   */
  _renderReportFooter(report) {
    const footer = this._dom.cloneTemplate('#tmpl-lighthouse-footer');
    footer.querySelector('.lighthouse-footer__version').textContent = report.lighthouseVersion;
    footer.querySelector('.lighthouse-footer__timestamp').textContent =
        formatDateTime(report.generatedTime);
    return footer;
  }

  /**
   * @param {!ReportJSON} report
   * @return {!Element}
   */
  _renderReport(report) {
    const container = this._dom._createElement('div', 'lighthouse-content');
    const element = container.appendChild(this._createElement('div', 'lh-report'));

    element.appendChild(this._renderReportHeader(report));

    const categories = element.appendChild(this._createElement('div', 'lh-categories'));
    for (const category of report.reportCategories) {
      categories.appendChild(this._renderCategory(category));
    }

    element.appendChild(this._renderReportFooter(report));

    return element;
  }

  /**
   * @param {!CategoryJSON} category
   * @return {!Element}
   */
  _renderCategory(category) {
    const element = this._dom.createElement('div', 'lh-category');
    element.appendChild(this._renderCategoryScore(category));

    const passedAudits = category.audits.filter(audit => audit.score === 100);
    const nonPassedAudits = category.audits.filter(audit => !passedAudits.includes(audit));

    for (const audit of nonPassedAudits) {
      element.appendChild(this._renderAudit(audit));
    }

    const passedElem = this._dom.createElement('details', 'lh-passed-audits');
    const passedSummary = this._dom.createElement('summary', 'lh-passed-audits-summary');
    passedSummary.textContent = `View ${passedAudits.length} passed items`;
    passedElem.appendChild(passedSummary);

    for (const audit of passedAudits) {
      passedElem.appendChild(this._renderAudit(audit));
    }
    element.appendChild(passedElem);
    return element;
  }

  /**
   * @param {!AuditJSON} audit
   * @return {!Element}
   */
  _renderAudit(audit) {
    const element = this._dom.createElement('div', 'lh-audit');
    element.appendChild(this._renderAuditScore(audit));
    return element;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReportRenderer;
}

/** @typedef {{id: string, weight: number, score: number, result: {description: string, displayValue: string, helpText: string, score: number|boolean, details: DetailsRenderer.DetailsJSON|undefined}}} */
let AuditJSON; // eslint-disable-line no-unused-vars

/** @typedef {{name: string, weight: number, score: number, description: string, audits: Array<AuditJSON>}} */
let CategoryJSON; // eslint-disable-line no-unused-vars

/** @typedef {{reportCategories: Array<CategoryJSON>}} */
let ReportJSON; // eslint-disable-line no-unused-vars
