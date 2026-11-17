# Claude 429 scope

Problem: A token refresh 429 blocked usage even after a valid token replacement.
Change: Keep separate refresh and usage holds per instance. Keep usage holds through token rotation. Instance identity is the conservative account boundary; token identity does not prove an account change. Unknown account replacements keep the hold until its deadline. Managed profiles remain separate. No new network fields, credential filenames, or credential logs were added. Existing usage holds remain in place.

Evidence: Reviewed CodexBar OAuthUsageFetcher at 1f6da9bec44455288ddee5ef6f3617a803d8eb2a and the scope change at e61c31f7f7faec6db7ecc2fd0a8028e3ee56cc25. Its token gate does not establish provider limit scope. No source was reused.

Overlap: The rate-limit helpers also concern point 1. Refresh call sites also concern point 3. This change does not add shared deadlines, escalation, error classification, or refresh ownership.

PR title: fix(claude): separate refresh and usage rate-limit holds

PR body: A refresh 429 previously blocked usage after a valid credential replacement. Store endpoint holds separately within each profile. Keep usage holds across token rotation to prevent a limit bypass. Preserve managed profile and web account boundaries. Add focused replacement and rotation coverage. Run Claude tests and bundle plugins.
