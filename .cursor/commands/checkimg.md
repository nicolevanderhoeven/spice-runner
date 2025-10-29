---
description: Check new game images against old versions and specifications
alwaysApply: false
---

# Image Checker Command

This command reviews new game images and validates them against:
1. Old versions under `img/old/` (for size comparison)
2. GRAPHICS-SPECIFICATIONS.md requirements
3. Code references (updates if filenames differ)

## Instructions

When the user runs this command with an image filename, you should:

### Step 1: Identify Images to Check

Ask the user which image(s) they want to check, or detect recently modified images in the `img/` directory.

### Step 2: Compare Dimensions with Old Versions

For each image being checked:
1. Get dimensions of the new image in `img/`
2. Get dimensions of the corresponding old image in `img/old/` (if it exists)
3. Report any size discrepancies

**Commands to use:**
```bash
# Check image dimensions (macOS)
file img/[filename].png
file img/old/[filename].png

# Or use sips for detailed info
sips -g pixelWidth -g pixelHeight img/[filename].png
```

### Step 3: Validate Against Specifications

Compare the image dimensions against GRAPHICS-SPECIFICATIONS.md:

| Image Type | 1x Expected | 2x Expected |
|-----------|-------------|-------------|
| `1x-trex.png` | 262×47px | N/A |
| `2x-trex.png` | N/A | 524×94px |
| `1x-obstacle-large.png` | 75×50px | N/A |
| `2x-obstacle-large.png` | N/A | 150×100px |
| `1x-obstacle-small.png` | 51×35px | N/A |
| `2x-obstacle-small.png` | N/A | 102×70px |
| `1x-cloud.png` | 46×13px | N/A |
| `2x-cloud.png` | N/A | 92×26px |
| `1x-horizon.png` | 1200×12px | N/A |
| `2x-horizon.png` | N/A | 2400×24px |
| `1x-restart.png` | 36×32px | N/A |
| `2x-restart.png` | N/A | 72×64px |
| `1x-text.png` | 191×13px | N/A |
| `2x-text.png` | N/A | 382×26px |

**Report format:**
```
✅ [filename]: Matches specification (expected: WxH, actual: WxH)
⚠️  [filename]: Size mismatch (expected: WxH, actual: WxH)
ℹ️  [filename]: No specification found (actual: WxH)
```

### Step 4: Check for Filename Changes

1. Compare filenames in `img/` vs `img/old/`
2. If new images have different names, search for references in code:

**Files to check:**
- `index.html` (in the `<div id="offline-resources">` section)
- `scripts/runner.js` (sprite loading configuration)

**Search commands:**
```bash
grep -r "old-filename.png" index.html scripts/
```

3. If references exist, propose code updates to use the new filenames

### Step 5: Generate Report

Provide a comprehensive report with:

```markdown
## Image Validation Report

### Images Checked: [list of images]

### Dimension Comparison

**New vs Old:**
- [filename]: Old (WxH) → New (WxH) [✅ Same / ⚠️ Different]

### Specification Compliance

- [filename]: [✅ Matches / ⚠️ Mismatch / ℹ️ No spec]
  - Expected: WxH
  - Actual: WxH
  - Difference: [if applicable]

### Code Reference Updates

[If filename changes detected:]
- ⚠️ File renamed: `old-name.png` → `new-name.png`
- References found in:
  - `index.html` line X
  - `scripts/runner.js` line Y

**Proposed changes:**
[Show the specific code changes needed]

### Recommendations

[Provide actionable recommendations:]
- Resize [image] from WxH to WxH to match specification
- Update code references for renamed files
- Consider [other suggestions]

### Next Steps

To fix dimension issues:
```bash
sips -z [height] [width] img/[filename].png --out img/[filename]-resized.png
mv img/[filename]-resized.png img/[filename].png
```

To deploy changes:
```bash
./build-and-push.sh
kubectl rollout restart deployment/spice-runner -n default
```
```

## Example Usage

**User:** `checkimg 1x-restart.png 2x-restart.png`

**Assistant response:**
1. Check dimensions of both files
2. Compare against old versions in `img/old/`
3. Validate against specifications (36×32px and 72×64px)
4. Report any discrepancies
5. Suggest fixes if needed

## Notes

- Always read GRAPHICS-SPECIFICATIONS.md for the latest specifications
- Use `file` or `sips` commands to get actual dimensions
- Check both 1x and 2x versions together (they should be proportional)
- Remind user to test images after changes by rebuilding and redeploying

