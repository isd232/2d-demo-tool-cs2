from pathlib import Path
import re

root = Path(__file__).resolve().parent
path = root / "static" / "js" / "effects.js"
text = path.read_text(encoding="utf-8")

if "drawPlayerLabels(drawn, k);" in text:
    print("Player labels are already updated.")
    raise SystemExit(0)

start = text.find("export function drawPlayers(players)")
if start < 0:
    raise SystemExit("Cannot find drawPlayers in effects.js. No files were changed.")

pattern = re.compile(
    r"    ctx\.strokeText\(label,.*?\n    ctx\.fillText\(label,.*?\n  }\n  ctx\.globalAlpha = 1;\n}",
    re.DOTALL,
)
function = text[start:]
font_start = function.find("  ctx.font = `${13 * k}px system-ui`;")
if font_start < 0:
    raise SystemExit("The label code differs from the expected version. No files were changed. Upload effects.js for an adapted patch.")

ending = pattern.search(function, font_start)
if not ending:
    raise SystemExit("Cannot identify the end of the label block. No files were changed.")

replacement = "  drawPlayerLabels(drawn, k);\n  ctx.globalAlpha = 1;\n}"
updated = text[:start] + function[:font_start] + replacement + function[ending.end():]
updated = "import { drawPlayerLabels } from './player-labels.js';\n" + updated
backup = path.with_suffix(".js.before-labels")
if not backup.exists():
    backup.write_text(text, encoding="utf-8")
path.write_text(updated, encoding="utf-8")
print("Updated player labels. Backup saved as effects.js.before-labels. Refresh the page.")
