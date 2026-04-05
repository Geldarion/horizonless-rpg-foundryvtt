param(
    [Parameter(Position = 0)]
    [string]$Path = ".",
    [switch]$Recurse
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-CharSeq {
    param([int[]]$Codes)
    return (-join ($Codes | ForEach-Object { [char]$_ }))
}

function Repair-MdText {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text
    )

    $fixed = $Text

    # Remove markdown links while preserving visible text: [text](url) -> text
    $fixed = [regex]::Replace($fixed, '\[([^\]]+)\]\((?:[^()\\]|\\.|(?:\([^)]*\)))*\)', '$1')

    # Remove raw URL tokens.
    $fixed = [regex]::Replace($fixed, '(?i)\bhttps?://\S+', '')
    $fixed = [regex]::Replace($fixed, '(?i)\bwww\.\S+', '')

    # Remove bookmark fragments if any remain after link cleanup.
    $fixed = [regex]::Replace($fixed, '#bookmark=[^\s)]+', '')
    # Remove markdown heading/inline anchors: {#anchor-id}
    $fixed = [regex]::Replace($fixed, '\{#[^}\s]+\}', '')

    # Repair common mojibake artifacts from imported markdown.
    $mojibakeMap = [ordered]@{}

    # cp1252-style mojibake (e.g. â€™)
    $mojibakeMap[(New-CharSeq 0x00E2,0x20AC,0x2122)] = "'"
    $mojibakeMap[(New-CharSeq 0x00E2,0x20AC,0x02DC)] = "'"
    $mojibakeMap[(New-CharSeq 0x00E2,0x20AC,0x0153)] = '"'
    $mojibakeMap[(New-CharSeq 0x00E2,0x20AC,0x009D)] = '"'
    $mojibakeMap[(New-CharSeq 0x00E2,0x20AC,0x201C)] = "-"
    $mojibakeMap[(New-CharSeq 0x00E2,0x20AC,0x201D)] = "-"
    $mojibakeMap[(New-CharSeq 0x00E2,0x20AC,0x00A6)] = "..."
    $mojibakeMap[(New-CharSeq 0x00C2)] = ""

    # cp1251-style mojibake (e.g. вЂ™)
    $mojibakeMap[(New-CharSeq 0x0432,0x0402,0x2122)] = "'"
    $mojibakeMap[(New-CharSeq 0x0432,0x20AC,0x2122)] = "'"
    $mojibakeMap[(New-CharSeq 0x0432,0x20AC,0x02DC)] = "'"
    $mojibakeMap[(New-CharSeq 0x0432,0x0402,0x0153)] = '"'
    $mojibakeMap[(New-CharSeq 0x0432,0x0402,0x009D)] = '"'
    $mojibakeMap[(New-CharSeq 0x0432,0x0402,0x201C)] = "-"
    $mojibakeMap[(New-CharSeq 0x0432,0x0402,0x201D)] = "-"
    $mojibakeMap[(New-CharSeq 0x0432,0x20AC,0x00A6)] = "..."

    foreach ($key in $mojibakeMap.Keys) {
        $fixed = $fixed.Replace($key, $mojibakeMap[$key])
    }

    # Normalize special punctuation to plain ASCII equivalents.
    $punctuationMap = [ordered]@{
        ([string][char]0x2018) = "'"
        ([string][char]0x2019) = "'"
        ([string][char]0x201A) = ","
        ([string][char]0x201B) = "'"
        ([string][char]0x201C) = '"'
        ([string][char]0x201D) = '"'
        ([string][char]0x201E) = '"'
        ([string][char]0x2013) = "-"
        ([string][char]0x2014) = "-"
        ([string][char]0x2212) = "-"
        ([string][char]0x2026) = "..."
        ([string][char]0x00A0) = " "
        ([string][char]0x00AD) = ""
    }

    foreach ($key in $punctuationMap.Keys) {
        $fixed = $fixed.Replace($key, $punctuationMap[$key])
    }

    # Remove non-printable control chars (except tab/newline/carriage return).
    $fixed = [regex]::Replace($fixed, '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '')

    # Collapse trailing spaces and excessive blank lines left by URL removal.
    $fixed = [regex]::Replace($fixed, '[ \t]+\r?\n', "`n")
    $fixed = [regex]::Replace($fixed, '(\r?\n){3,}', "`n`n")

    # Final hardening: drop any remaining non-ASCII codepoints.
    $fixed = [regex]::Replace($fixed, '[^\x00-\x7F]', '')

    return $fixed
}

$resolved = Resolve-Path -LiteralPath $Path
$item = Get-Item -LiteralPath $resolved

$targets = @()
if ($item.PSIsContainer) {
    if ($Recurse) {
        $targets = Get-ChildItem -LiteralPath $item.FullName -Filter "*.md" -File -Recurse
    } else {
        $targets = Get-ChildItem -LiteralPath $item.FullName -Filter "*.md" -File
    }
} else {
    if ($item.Extension -ne ".md") {
        throw "Path is a file but not a .md file: $($item.FullName)"
    }
    $targets = @($item)
}

if ($targets.Count -eq 0) {
    Write-Host "No .md files found."
    exit 0
}

$changed = 0
foreach ($file in $targets) {
    $original = Get-Content -Raw -LiteralPath $file.FullName
    $updated = Repair-MdText -Text $original
    if ($updated -ne $original) {
        Set-Content -LiteralPath $file.FullName -Value $updated -Encoding UTF8
        Write-Host "Updated: $($file.FullName)"
        $changed++
    } else {
        Write-Host "Unchanged: $($file.FullName)"
    }
}

Write-Host ""
Write-Host ("Processed {0} file(s); updated {1}." -f $targets.Count, $changed)
