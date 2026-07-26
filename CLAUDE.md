# CRIXUS Awake Pet harness contract

When the user says “CRIXUS, enable your avatar,” “put your avatar up,” or “show your avatar,” execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\CRIXUS_AVATAR.ps1" enable
```

Use `disable` for “disable/hide your avatar.”

Use the dedicated behavior poses as visible reactions:

- `pose -Pose error-log -Duration 8000` when the user says “log this error,” then perform the real error log
- `pose -Pose checkpoint -Duration 6000` while saving/checkpointing work
- `pose -Pose success -Duration 6000` after verified completion
- `pose -Pose blocked -Duration 8000` at a real blocker

Verify enablement with `.\CRIXUS_AVATAR.ps1 status`. Do not claim success unless `running` and `visible` are both true.

CRIXUS roams automatically. “Stay put” maps to `.\CRIXUS_AVATAR.ps1 roam -Mode off`; “resume roaming” maps to `.\CRIXUS_AVATAR.ps1 roam -Mode on`.

After every verified repository change, run `.\SYNC_TO_GITHUB.ps1`. Do not bypass its tests or publication safety scan and never force-push.
