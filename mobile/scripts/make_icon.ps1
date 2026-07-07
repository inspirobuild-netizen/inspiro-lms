# Trims whitespace from the logo, then generates square app-icon assets.
# Input : assets/branding/inspiro_logo.png  (may have wide white margins)
# Output: overwrites inspiro_logo.png with a TIGHT-cropped logo (original kept
#           as inspiro_logo_original.png), plus:
#         assets/branding/app_icon.png            (1024, white tile, full logo)
#         assets/branding/app_icon_foreground.png (1024, transparent, safe-zone)
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$src  = Join-Path $root 'assets\branding\inspiro_logo.png'
if (-not (Test-Path $src)) { Write-Error "Missing $src"; exit 1 }

$orig = New-Object System.Drawing.Bitmap($src)

# ── 1. Detect content bounding box on a downscaled copy (fast) ─────────────────
$scaleDown = 8
$sw = [int]($orig.Width / $scaleDown)
$sh = [int]($orig.Height / $scaleDown)
$small = New-Object System.Drawing.Bitmap($sw, $sh)
$sg = [System.Drawing.Graphics]::FromImage($small)
$sg.InterpolationMode = 'HighQualityBicubic'
$sg.DrawImage($orig, 0, 0, $sw, $sh)
$sg.Dispose()

$minX = $sw; $minY = $sh; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $sh; $y++) {
  for ($x = 0; $x -lt $sw; $x++) {
    $p = $small.GetPixel($x, $y)
    $isContent = ($p.A -gt 16) -and -not ($p.R -gt 244 -and $p.G -gt 244 -and $p.B -gt 244)
    if ($isContent) {
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$small.Dispose()
if ($maxX -le $minX -or $maxY -le $minY) { Write-Error "No content detected"; exit 1 }

# Map back to full res + small margin
$marginFrac = 0.04
$bx = $minX * $scaleDown; $by = $minY * $scaleDown
$bw = ($maxX - $minX + 1) * $scaleDown; $bh = ($maxY - $minY + 1) * $scaleDown
$mx = [int]($bw * $marginFrac); $my = [int]($bh * $marginFrac)
$bx = [Math]::Max(0, $bx - $mx); $by = [Math]::Max(0, $by - $my)
$bw = [Math]::Min($orig.Width  - $bx, $bw + 2 * $mx)
$bh = [Math]::Min($orig.Height - $by, $bh + 2 * $my)

$rect = New-Object System.Drawing.Rectangle($bx, $by, $bw, $bh)
$trim = $orig.Clone($rect, $orig.PixelFormat)
Write-Host "Trimmed to $bw x $bh (from $($orig.Width) x $($orig.Height))"

# Back up original, overwrite inspiro_logo.png with the tight crop
Copy-Item $src (Join-Path $root 'assets\branding\inspiro_logo_original.png') -Force
$orig.Dispose()
$trim.Save($src, [System.Drawing.Imaging.ImageFormat]::Png)

# ── 2. Build square icons from the trimmed logo ───────────────────────────────
function New-Icon([double]$fillFrac, [System.Drawing.Color]$bg, [string]$out) {
  $size = 1024
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'
  $g.Clear($bg)
  # Fit within a box of $fillFrac on BOTH axes, preserving aspect ratio
  $box = $size * $fillFrac
  $scale = [Math]::Min($box / $trim.Width, $box / $trim.Height)
  $w = $trim.Width * $scale; $h = $trim.Height * $scale
  $g.DrawImage($trim, ($size - $w) / 2, ($size - $h) / 2, $w, $h)
  $g.Dispose()
  $bmp.Save((Join-Path $root $out), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $out"
}

New-Icon 0.86 ([System.Drawing.Color]::White) 'assets\branding\app_icon.png'
New-Icon 0.68 ([System.Drawing.Color]::Transparent) 'assets\branding\app_icon_foreground.png'
$trim.Dispose()
Write-Host "OK"
