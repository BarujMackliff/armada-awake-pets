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

CRIXUS animates in place frequently but relocates only after a 14/34/44-minute pin and at least 60 seconds of system idle time. “Stay put” maps to `.\CRIXUS_AVATAR.ps1 roam -Mode off`; “resume smart relocation” maps to `.\CRIXUS_AVATAR.ps1 roam -Mode on`.

When the user addresses CRIXUS and names an open app as a destination, run `.\CRIXUS_AVATAR.ps1 move-to -AppName "<app>"`. `OBSIDINNA` normalizes to Obsidian and Google Chrome normalizes to Chrome. “Get out of the way,” “I need to read,” or “show me the options” maps to `yield -Duration 30000`. Jump/sword/scratch/sit/patrol/look/shield/sleep requests map to `animate -Motion <name>`.

After every verified repository change, run `.\SYNC_TO_GITHUB.ps1`. Do not bypass its tests or publication safety scan and never force-push.
