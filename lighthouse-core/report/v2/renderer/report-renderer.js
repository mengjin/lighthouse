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

/* globals DOM, DetailsRenderer, ReportFeatures */

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
    month: 'short', day: 'numeric', year: 'numeric',
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

class ReportRenderer {
  /**
   * @param {!Document} document
   */
  constructor(document) {
    this._dom = new DOM(document);
    this._detailsRenderer = new DetailsRenderer(this._dom);
    this._reportFeatures = new ReportFeatures(document);
  }

  /**
   * @param {!ReportJSON} report
   * @param {!Element} container Parent element to render the report into.
   * @return {!Element}
   */
  renderReport(report, container) {
    container.innerHTML = ''; // Remove previous report.

    let element;
    try {
      element = container.appendChild(this._renderReport(report));

      // Hook in JS features and add page-level event listeners after the report
      // is in the document.
      this._reportFeatures.attach(report);
    } catch (e) {
      element = container.appendChild(this._renderException(e));
    }

    return element;
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
    const header = this._dom.cloneTemplate('#tmpl-lh-heading');
    header.querySelector('.lh-config__timestamp').textContent =
        formatDateTime(report.generatedTime);
    const url = header.querySelector('.lh-metadata__url');
    url.href = report.url;
    url.textContent = report.url;

    const env = header.querySelector('.lh-env__items');
    report.runtimeConfig.environment.forEach(runtime => {
      const item = this._dom.cloneTemplate('#tmpl-lh-env__items', env);
      item.querySelector('.lh-env__name').textContent = runtime.name;
      item.querySelector('.lh-env__description').textContent = runtime.description;
      item.querySelector('.lh-env__enabled').textContent =
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
    const footer = this._dom.cloneTemplate('#tmpl-lh-footer');
    footer.querySelector('.lh-footer__version').textContent = report.lighthouseVersion;
    footer.querySelector('.lh-footer__timestamp').textContent =
        formatDateTime(report.generatedTime);
    return footer;
  }

  /**
   * @param {!ReportJSON} report
   * @return {!Element}
   */
  _renderReport(report) {
    const container = this._dom.createElement('div', 'lh-content');
    const element = container.appendChild(this._dom.createElement('div', 'lh-report'));

    element.appendChild(this._renderReportHeader(report));

    const categories = element.appendChild(this._dom.createElement('div', 'lh-categories'));
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
  module.exports = {
    formatDateTime,
    formatNumber,
    calculateRating,
    ReportRenderer
  };
}

/** @typedef {{id: string, weight: number, score: number, result: {description: string, displayValue: string, helpText: string, score: number|boolean, details: DetailsRenderer.DetailsJSON|undefined}}} */
let AuditJSON; // eslint-disable-line no-unused-vars

/** @typedef {{name: string, weight: number, score: number, description: string, audits: Array<AuditJSON>}} */
let CategoryJSON; // eslint-disable-line no-unused-vars

/** @typedef {{reportCategories: Array<CategoryJSON>}} */
let ReportJSON; // eslint-disable-line no-unused-vars
