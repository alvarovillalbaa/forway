import { el, replace, action, downloadText, formatDate } from './ui.mjs';
import { reportMarkdown } from './site-report.mjs';

const AREA = { seo: ['SEO basics', 'Metadata and source structure'], geo: ['Answer structure', 'Extractable answers and references'],
  agents: ['Agent source signals', 'Rendered agent tasks are not tested'] };
function artifact(value) {
  if (new TextEncoder().encode(value).length > 8 * 1024 * 1024) throw new Error('Report export exceeds eight MiB.');
  return value;
}

export function renderSiteReport(container, report, { notice, edit, evidence, current, idPrefix = '' }) {
  const copyPrompt = async (text, field, button) => {
    button.disabled = true;
    try {
      artifact(text);
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (current()) notice('Implementation prompt copied. Review it with your site’s code before applying changes.');
    } catch {
      if (!current()) return;
      if (field) {
        field.closest('details').open = true; field.focus(); field.select();
        notice('Select and copy the prompt below. Your browser did not confirm clipboard access.');
      } else notice('The combined prompts could not be copied. Open an individual task to select its prompt.', true);
    } finally { if (current() && button.isConnected) button.disabled = false; }
  };
  const allPrompts = action('Copy all prompts', () => {
    void copyPrompt(report.tasks.map(task => task.prompt).join('\n\n---\n\n'), null, allPrompts);
  }, 'button button-secondary');
  allPrompts.disabled = !report.tasks.length;
  const save = action('Download report', () => {
    try { downloadText('forway-report.md', artifact(reportMarkdown(report)), 'text/markdown'); notice('Report prepared for download, including its scope and original supplied answers.'); }
    catch { notice('The report exceeds the download limit. Export the original workspace to keep your page and supplied evidence.', true); }
  }, 'quiet');
  const coverage = report.coverage;
  const scopeText = coverage.scope === 'page' ? 'Single-page source check'
    : coverage.state === 'frontier_exhausted' ? 'Discoverable frontier exhausted' : `Partial site check · ${coverage.state}`;
  const cards = report.areas.map(area => el('article', { className: 'report-signal' },
    el('p', { className: 'eyebrow' }, AREA[area.id][0]),
    el('p', { className: 'signal-count' }, el('strong', {}, area.pass), el('span', {}, ` / ${area.total} source checks pass`)),
    el('meter', { min: 0, max: area.total, value: area.pass, 'aria-label': `${AREA[area.id][0]}: ${area.pass} of ${area.total} source checks pass` }),
    el('p', { className: 'signal-breakdown' }, `${area.fail} need attention · ${area.review} to review`),
    el('small', {}, AREA[area.id][1])));
  const taskNodes = report.tasks.map((task, index) => {
    const field = el('textarea', { id: `${idPrefix}task-prompt-${index}`, rows: 8, readonly: '', spellcheck: 'false', className: 'implementation-prompt' }, task.prompt);
    const copy = action('Copy prompt', () => { void copyPrompt(task.prompt, field, copy); }, 'button button-small button-secondary');
    return el('article', { className: 'report-task' },
      el('div', { className: 'task-heading' }, el('span', { className: `task-priority priority-${task.priority}` }, task.action),
        el('h3', {}, task.label), el('span', { className: 'task-pages' }, `${task.affectedPageCount} of ${coverage.audited} analyzed pages`)),
      el('p', {}, task.recommendation),
      el('div', { className: 'task-actions' }, el('span', {}, AREA[task.area][0]), copy),
      el('details', { className: 'task-evidence' }, el('summary', {}, 'Observed evidence & implementation prompt'),
        el('ul', { className: 'task-url-list' }, task.observed.map(row => el('li', {},
          el('a', { href: row.url, target: '_blank', rel: 'noopener noreferrer' }, row.url), el('p', {}, row.detail)))),
        el('label', { for: `${idPrefix}task-prompt-${index}` }, 'Review or select this prompt'), field));
  });
  const answerGroups = report.answerGroups.map(group => el('details', { className: 'answer-group' },
    el('summary', {}, `${group.engine} · ${group.brand} · ${group.answerCount} supplied answer${group.answerCount === 1 ? '' : 's'}`),
    el('p', { className: 'answer-query' }, group.prompt),
    el('p', {}, `${group.brandMentionCount}/${group.answerCount} mention the brand · ${group.ownedCitationCount}/${group.answerCount} contain an explicit owned-domain URL`),
    el('p', { className: 'field-help' }, 'Grouped by the exact query, engine and brand/domain/competitor cohort. These are supplied answers, not a representative provider run.'),
    group.observations.map(row => el('details', { className: 'answer-original' }, el('summary', {}, `Observed ${formatDate(row.observedAt)}`), el('blockquote', {}, row.answer)))));
  replace(container,
    el('div', { className: 'report-intro' }, el('div', {}, el('p', { className: 'eyebrow' }, 'Your next improvements'),
      el('h2', {}, report.hostname), el('p', { className: 'report-coverage' }, scopeText),
      el('p', { className: 'field-help' }, `${coverage.audited} analyzed / ${coverage.discovered} discovered URLs · ${coverage.remaining} pending · ${coverage.refused} refused · ${coverage.failed} failed · ${coverage.redirected ?? 0} redirected aliases`)),
      el('div', { className: 'button-row' }, save, allPrompts)),
    el('div', { className: 'report-signals' }, cards),
    el('details', { className: 'report-source-times' }, el('summary', {}, 'Page sources & capture times'),
      el('ul', { className: 'task-url-list' }, report.pages.map(page => el('li', {},
        el('a', { href: page.url, target: '_blank', rel: 'noopener noreferrer' }, page.url),
        el('p', {}, page.sourceKind === 'fetched' ? `Public source fetched ${formatDate(page.fetchedAt)}` : 'Supplied or imported HTML; no fetch time is asserted.'))))),
    el('p', { className: 'report-scope' }, coverage.scope === 'page'
      ? 'This report covers the page source you analyzed. It is not a domain crawl, search ranking or rendered agent-usability result.'
      : 'Coverage is limited to discovered, allowed URLs. Pending, refused and failed pages are not counted as successful checks.'),
    el('section', { className: 'report-task-section', 'aria-label': 'Prioritized improvements' },
      el('div', { className: 'report-section-heading' }, el('h2', {}, 'What to work on next'),
        coverage.audited === 1 ? action('Open content editor →', edit) : null),
      el('p', { className: 'muted' }, 'Fix observed failures first. Review intent-dependent gaps next; optional content patterns come last. Each task keeps its evidence.'),
      taskNodes.length ? taskNodes : el('p', {}, 'No gaps were flagged by these source checks. Other pages, rendered behavior and provider answers still need their own evidence.')),
    el('section', { className: 'report-ai', 'aria-label': 'AI answer evidence for this site' },
      el('div', { className: 'report-section-heading' }, el('h2', {}, 'Do AI answers mention you?'), action('Add an observed answer →', evidence)),
      el('div', { className: 'unmeasured' }, el('span', { className: 'status-pill' }, 'Live visibility: not measured'),
        el('p', {}, 'A source check cannot answer that. Keep actual answers and their exact questions alongside this report.')),
      el('p', { className: 'field-help' }, 'Only evidence declared for this exact hostname appears here. Other domain cohorts stay in AI evidence.'),
      answerGroups.length ? answerGroups : el('p', { className: 'muted' }, 'No supplied answers match this domain yet. Missing measurements are not zero visibility.')));
}
