# CRIXUS Awake Pet harness contract

When a user says “CRIXUS, enable your avatar,” “put your avatar up,” or “show your avatar,” run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\CRIXUS_AVATAR.ps1" enable
```

For “disable/hide your avatar,” use `disable`.

For state reactions:

- “log this error” → `pose -Pose error-log -Duration 8000`, followed by the harness’s real error/mistake logging process
- save/checkpoint work → `pose -Pose checkpoint -Duration 6000`
- verified completion → `pose -Pose success -Duration 6000`
- real blocker → `pose -Pose blocked -Duration 8000`

Do not report enablement until `.\CRIXUS_AVATAR.ps1 status` returns both `"running": true` and `"visible": true`.

CRIXUS roams automatically by default. “Stay put” means `.\CRIXUS_AVATAR.ps1 roam -Mode off`; “resume roaming” means `.\CRIXUS_AVATAR.ps1 roam -Mode on`.

After every verified change inside this repository, run `.\SYNC_TO_GITHUB.ps1`. It must pass tests and the publication safety scan before it can commit or push. Never bypass the scan and never force-push.
