/**
 * Audit log writer for Doctor sessions — append-only logging to doctor-log.json (Story 7.4).
 */

import type { Result } from '../types/index.js';
import { ok, err, logger } from '../utils/index.js';
import { readDoctorLog, writeDoctorLog } from '../store/index.js';
import type {
  DoctorLogEntry,
  DoctorFinding,
  DoctorLogAction,
  DoctorMode,
  DoctorTrigger,
  AuditAction,
  DiagnosticFinding,
  FixResult,
  DoctorHistorySummary,
} from './types.js';
import { MAX_DOCTOR_LOG_ENTRIES } from './types.js';

const MODULE = 'doctor:audit-log';

/**
 * Generate a log entry ID: doc_YYYYMMDD_NNN where NNN increments daily.
 */
export function generateLogEntryId(existingEntries: { id: string }[]): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');

  // Count existing entries for today
  const todayPrefix = `doc_${dateStr}_`;
  let maxSeq = 0;
  for (const entry of existingEntries) {
    if (entry.id.startsWith(todayPrefix)) {
      const seqStr = entry.id.slice(todayPrefix.length);
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `${todayPrefix}${nextSeq}`;
}

/**
 * Build a DoctorLogEntry from session parameters.
 */
export function buildLogEntry(params: {
  mode: DoctorMode;
  trigger: DoctorTrigger;
  triggerDetail: string;
  usedArchive: boolean;
  findings: DiagnosticFinding[];
  fixResults: FixResult[];
  healthBefore: number;
  healthAfter: number;
  tokensCost: number;
  existingEntries?: { id: string }[];
}): DoctorLogEntry {
  const findings: DoctorFinding[] = params.findings.map((f) => ({
    type: f.type,
    severity: f.severity,
    message: f.description,
    file: f.affectedFiles[0] ?? null,
  }));

  const actions: DoctorLogAction[] = params.fixResults.map((fr) => {
    let actionStr: string;
    if (fr.applied && fr.approvedBy === 'auto') {
      actionStr = 'auto-applied';
    } else if (fr.applied) {
      actionStr = 'applied';
    } else {
      actionStr = 'skipped';
    }

    return {
      action: actionStr,
      target: `${fr.proposal.action}: ${fr.proposal.finding.affectedFiles.join(', ')}`,
      result: fr.result,
    };
  });

  return {
    id: generateLogEntryId(params.existingEntries ?? []),
    timestamp: new Date().toISOString(),
    mode: params.mode,
    trigger: params.trigger,
    triggerDetail: params.triggerDetail,
    usedArchive: params.usedArchive,
    findings,
    actions,
    healthScore: { before: params.healthBefore, after: params.healthAfter },
    tokensCost: params.tokensCost,
  };
}

/**
 * Map FixResult[] to AuditAction[] for external consumption.
 */
export function mapFixResultsToAuditActions(fixResults: FixResult[]): AuditAction[] {
  return fixResults.map((fr) => {
    let action: AuditAction['action'];
    if (!fr.applied) {
      action = 'skipped';
    } else if (fr.approvedBy === 'auto') {
      action = 'auto-applied';
    } else {
      action = 'applied';
    }

    return {
      finding: `${fr.proposal.finding.type}: ${fr.proposal.finding.affectedFiles.join(', ')}`,
      action,
      approvedBy: fr.approvedBy,
      result: fr.result,
    };
  });
}

/**
 * Get per-domain timestamps of the last doctor run (D5).
 * Used for incremental diagnostics to skip unchanged domains.
 */
export function getLastRunTimestamps(
  projectRoot: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  const logResult = readDoctorLog(projectRoot);
  if (!logResult.ok) return result;

  for (const entry of logResult.value.entries) {
    // Extract domains from findings
    for (const finding of entry.findings) {
      if (finding.file) {
        // Use entry timestamp as last run time for any domain found
        const domain = finding.type; // approximate — domain info is in finding context
        if (!result[domain] || entry.timestamp > result[domain]) {
          result[domain] = entry.timestamp;
        }
      }
    }
    // Also track the overall timestamp
    if (!result['__overall__'] || entry.timestamp > result['__overall__']) {
      result['__overall__'] = entry.timestamp;
    }
  }

  return result;
}

/**
 * Append a DoctorLogEntry to doctor-log.json. Never truncates existing entries.
 */
export function writeDoctorLogEntry(
  projectRoot: string,
  entry: DoctorLogEntry,
): Result<void> {
  try {
    const logResult = readDoctorLog(projectRoot);
    if (!logResult.ok) {
      return err(`Cannot read doctor-log: ${logResult.error}`);
    }

    const log = logResult.value;

    // Adapt DoctorLogEntry to the store's DoctorEntry format
    const storeEntry = {
      id: entry.id,
      timestamp: entry.timestamp,
      mode: entry.mode,
      findings: entry.findings.map((f) => ({
        type: f.type,
        severity: f.severity,
        message: f.message,
        file: f.file,
      })),
      actions: entry.actions.map((a) => ({
        action: a.action,
        target: a.target,
        result: a.result,
      })),
      healthScore: {
        overall: entry.healthScore.after,
        accuracy: entry.healthScore.after,
        staleness: 0,
        coverage: 0,
      },
    };

    log.entries.push(storeEntry);

    // D11: Rotate if over cap
    if (log.entries.length > MAX_DOCTOR_LOG_ENTRIES) {
      const excess = log.entries.length - MAX_DOCTOR_LOG_ENTRIES;
      log.entries = log.entries.slice(excess);
      logger.debug(MODULE, `Rotated doctor-log: removed ${excess} oldest entries`);
    }

    const writeResult = writeDoctorLog(projectRoot, log);
    if (!writeResult.ok) {
      return err(`Cannot write doctor-log: ${writeResult.error}`);
    }

    return ok(undefined);
  } catch (error) {
    logger.error(MODULE, 'Failed to write audit log entry', error);
    return err(`Audit log write failed: ${String(error)}`);
  }
}

/**
 * Summarize doctor history trends from the log (D11).
 */
export function summarizeDoctorHistory(
  projectRoot: string,
): Result<DoctorHistorySummary> {
  const logResult = readDoctorLog(projectRoot);
  if (!logResult.ok) return err(`Cannot read doctor-log: ${logResult.error}`);

  const entries = logResult.value.entries;
  let totalFixesApplied = 0;
  let totalFixesSkipped = 0;
  const issueTypeCounts = new Map<string, number>();
  const domainSessionCounts = new Map<string, number>();

  for (const entry of entries) {
    for (const action of entry.actions) {
      if (action.action === 'applied' || action.action === 'auto-applied') {
        totalFixesApplied++;
      } else {
        totalFixesSkipped++;
      }
    }

    for (const finding of entry.findings) {
      issueTypeCounts.set(finding.type, (issueTypeCounts.get(finding.type) ?? 0) + 1);
    }

    // Track unique domains per session
    const sessionDomains = new Set<string>();
    for (const finding of entry.findings) {
      if (finding.file) {
        sessionDomains.add(finding.type); // approximate domain from finding type
      }
    }
    for (const d of sessionDomains) {
      domainSessionCounts.set(d, (domainSessionCounts.get(d) ?? 0) + 1);
    }
  }

  const recurringIssues = [...issueTypeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const domainAttention = [...domainSessionCounts.entries()]
    .map(([domain, sessions]) => ({ domain, sessions }))
    .sort((a, b) => b.sessions - a.sessions);

  return ok({
    totalSessions: entries.length,
    totalFixesApplied,
    totalFixesSkipped,
    recurringIssues,
    domainAttention,
  });
}
