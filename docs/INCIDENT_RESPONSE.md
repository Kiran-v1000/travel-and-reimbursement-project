# Incident response and breach notification (DRAFT)

> **Draft for approval.** Names, phone numbers and the legal review below must be filled in and
> approved by management, IT security and Legal before go-live. Indian law sets short deadlines:
> this procedure is written so that the first steps happen within hours, not days.

## Who is involved

| Role | Responsibility | Person (to fill in) |
|---|---|---|
| Incident lead | Runs the response, keeps the timeline, decides on escalation | |
| IT / server owner | Contains the incident on the servers, preserves evidence | |
| Application owner (Voyage) | Knows the app, revokes sessions, reads the audit trail | |
| Finance lead | Checks payments, freezes payouts if needed | |
| Legal / Data Protection Officer | Decides on notifications to CERT-In, the Data Protection Board and affected people | |
| Communications / HR | Messages to employees | |

## What counts as an incident

- Someone saw or changed data they should not have (records, receipts, payments, audit trail).
- Stolen or misused credentials, especially Finance or Administrator accounts.
- Malware found in uploads or on the servers; ransomware; unusual outbound traffic.
- A payment made to the wrong person or for the wrong amount through misuse.
- Lost backups or exports (e.g. an accounting export on a lost laptop).
- `/api/audit/verify` reports a broken chain.

## Response steps

1. **Detect and report (immediately).** Anyone who suspects an incident tells the incident lead.
   Write down the time, what was seen and by whom. Do not delete anything.
2. **Assess (within 1 hour).** What data and how many people are affected? Is it ongoing? Is it a
   reportable incident (see "Notifications")?
3. **Contain (as fast as possible).**
   - End sessions: deactivate the account (all its sessions end at once) or have the person use
     *Profile → Sign out other devices*; reset passwords; disable the account in Microsoft Entra ID.
   - Rotate secrets if they may be exposed: `JWT_SECRET` (signs everyone out), database password,
     SMTP and Entra client secrets.
   - Freeze payouts: Finance stops recording payments until the payment data is checked.
   - Put a **legal hold** on affected records so the retention job cannot purge evidence.
4. **Preserve evidence.** Export the audit trail (`Audit trail → Export`) and run *Verify*; keep
   server logs, database snapshots and the affected files. Note who did what and when.
5. **Eradicate and recover.** Fix the cause, restore from backup if needed (`deploy/restore.sh`),
   verify the audit chain, re-enable services, watch closely for repeat activity.
6. **Notify** (below) and **review**: within two weeks, a short written review with the timeline,
   root cause and actions; update this procedure and the tests.

## Notifications (Legal to confirm before go-live)

| To | When | Basis |
|---|---|---|
| **CERT-In** (incident@cert-in.org.in) | **Within 6 hours** of noticing a reportable cyber security incident (e.g. data breach, unauthorised access, malware / ransomware, identity theft) | CERT-In Directions of 28 April 2022 under the IT Act, s. 70B |
| **Data Protection Board of India** and **each affected person** | Without delay after becoming aware of a personal data breach, followed by a detailed report (the Rules set a 72-hour window for the detailed report) | Digital Personal Data Protection Act 2023 and DPDP Rules 2025 |
| Company management, IT security, auditors | Immediately for anything involving payments, Finance / Admin accounts or the audit trail | Internal policy |
| Bank / payment provider | Immediately if payment data or payouts are affected | Contract |

Keep logs and records needed for these reports for at least 180 days (CERT-In requires logs to be
kept for 180 days within India); check the server log retention settings match.

## After every incident

- Update the authorization tests (`server/tests/authorization.e2e.test.js`) with the case that
  failed, so it cannot happen again unnoticed.
- Review who holds Administrator, Finance and production access.
