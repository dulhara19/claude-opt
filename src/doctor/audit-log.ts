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
} from './types.js';

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
