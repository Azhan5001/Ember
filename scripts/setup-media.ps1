$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$release = 'https://github.com/Azhan5001/Ember/releases/download/v1.0-deps'
$media = Join-Path $PSScriptRoot '../vendor/media'
[void][IO.Directory]::CreateDirectory($media)
$checksums = @{
    'ffmpeg.exe' = 'e49f39b5720de3edf15d63a76e4d6e8d04c0c2e641b0ca118360ee4c4bd52e36'
    'ffprobe.exe' = '8a2e6a26236f154d093eebe98251c52adaf047de2d6c73478da5e4df8c48ce7b'
}
function Get-MediaHash([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
        $stream.Dispose()
    }
}
foreach ($name in $checksums.Keys) {
    $target = Join-Path $media $name
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        if ((Get-MediaHash $target) -ne $checksums[$name]) {
            throw "Unexpected SHA-256 for existing $name"
        }
        continue
    }
    $temp = Join-Path $media ([Guid]::NewGuid().ToString() + '.partial')
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$release/$name" -OutFile $temp
        if ((Get-MediaHash $temp) -ne $checksums[$name]) {
            throw "Unexpected SHA-256 for $name"
        }
        Move-Item -LiteralPath $temp -Destination $target
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp }
    }
}
