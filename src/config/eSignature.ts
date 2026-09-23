import fs from 'fs';
import path from 'path';

/**
 * Issuing company details printed in the electronic signature stamp.
 */
export const E_SIGNATURE_COMPANY_NAME = 'Universal Quality Management Systems (Pvt) Ltd.';
export const E_SIGNATURE_SURVEYOR_CAPTION = 'Surveyor to Universal Quality Management Systems (Pvt) Ltd';

/** Reference the electronic signature is issued under, printed as "Signed Electronically in accordance with …". */
export const E_SIGNATURE_CIRCULAR_REF = 'UQMS-QM-007, Clause 1.1.2(d),Rev 1';

/** Seal image drawn on the left of the stamp; the company logo, resolved for both ts-node and the build output. */
export const resolveSealPath = (): string | null => {
  const candidates = [
    path.join(__dirname, '../public/logo.png'),
    path.join(__dirname, '../../src/public/logo.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

/**
 * Roles that may apply the signature on any document while the system is being
 * rolled out. The stamp still carries the assigned surveyor's details; the
 * signature records who actually applied it (`appliedBy`).
 * Temporary: remove a role here to restore "assigned surveyor only" signing for it.
 */
export const E_SIGNATURE_BYPASS_ROLES = ['admin', 'uqms-admin'];
