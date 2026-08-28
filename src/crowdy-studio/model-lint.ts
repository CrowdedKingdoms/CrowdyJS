import { print } from 'graphql';
import { CrowdyModelLintDocument } from '../generated/graphql.js';
import type {
  CrowdyStudioDiagnostic,
  CrowdyStudioDiagnosticSeverity,
} from './diagnostics.js';
import type { CrowdyStudioTarget } from './models.js';

/**
 * Turn `gameModelLint` findings into the diagnostics an editor already renders.
 *
 * WHY THIS IS A MAPPER AND NOT A NEW SURFACE. `CrowdyStudioDiagnostic` already exists on
 * both SDKs, already carries a severity, a code and a message, and CrowdyJS already
 * publishes it over `textDocument/publishDiagnostics` into Monaco. Lint findings are the
 * same kind of thing arriving from a different place, so they become a `source` and reuse
 * the Problems list, the gutter and the filtering for free. A second panel with its own
 * shape would be a second thing to maintain and a second place for a developer to look.
 *
 * WHO CAN CALL THE QUERY THIS CONSUMES. `gameModelLint` is gated on `manage_apps`, so this
 * is for an authoring context — Studio, an engine editor, a dev build signed in as someone
 * who administers the app. A shipped game holding a player token cannot call it and should
 * not be able to: what a player's client gets instead is the server refusing the specific
 * operation, which `recordRefusal` in `./model-lint-log.js` surfaces.
 *
 * THERE IS NO FILE OR LINE, and pretending otherwise would be worse than admitting it.
 * A finding is about a function, a container type or the app, none of which the developer
 * has open in a text editor — the model is authored through the API. So `path` carries the
 * subject and the line is 1: enough for the Problems list to group and label them, without
 * inventing a location that would send a click into the wrong file.
 */

/** One finding as `gameModelLint` returns it. */
export interface CrowdyModelLintFinding {
  code: string;
  severity: 'error' | 'warning';
  subjectKind: string;
  subject: string;
  message: string;
  remedy?: string | null;
  count?: number | null;
}

export interface CrowdyModelLintResult {
  appId: string;
  findings: CrowdyModelLintFinding[];
  errorCount: number;
  warningCount: number;
  clean: boolean;
}

/**
 * The lint query, printed from the generated document rather than written here.
 *
 * IT USED TO BE A TEMPLATE LITERAL, and that made it the one query in this SDK that
 * `check:schema` could not validate: codegen only sees operation documents, so the query
 * asking "is this app's model coherent" was itself unchecked against the schema it targets.
 * `gameModelLint` was not even present in the committed SDL. Printing from
 * `CrowdyModelLintDocument` means the string and the validated document cannot disagree.
 */
export const MODEL_LINT_QUERY = print(CrowdyModelLintDocument);

function severityOf(
  finding: CrowdyModelLintFinding,
): CrowdyStudioDiagnosticSeverity {
  return finding.severity === 'error' ? 'error' : 'warning';
}

/**
 * A stable, readable label for the thing the finding is about.
 *
 * Prefixed with the kind because subjects collide across kinds — an automation and a
 * function may both be called `on_join`, and a Problems list that showed both as `on_join`
 * would be actively misleading about which one is broken.
 */
export function modelLintSubjectPath(finding: CrowdyModelLintFinding): string {
  return `${finding.subjectKind}/${finding.subject}`;
}

export function modelLintDiagnostics(
  result: CrowdyModelLintResult | null | undefined,
  target: CrowdyStudioTarget = 'SERVER' as CrowdyStudioTarget,
): CrowdyStudioDiagnostic[] {
  if (!result?.findings?.length) return [];
  return result.findings.map((finding) => ({
    target,
    path: modelLintSubjectPath(finding),
    line: 1,
    column: 1,
    severity: severityOf(finding),
    // The remedy is joined into the message rather than dropped: an editor's Problems
    // list shows one line per entry and has nowhere else to put it, and a finding a
    // developer cannot act on from where they are reading it is the failure this whole
    // feature exists to fix.
    message: finding.remedy
      ? `${finding.message} — ${finding.remedy}`
      : finding.message,
    code: finding.code,
    source: 'model-lint' as const,
  }));
}
