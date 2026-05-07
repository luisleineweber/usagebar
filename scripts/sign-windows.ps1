param(
  [Parameter(Mandatory = $true)]
  [string] $TargetPath
)

$ErrorActionPreference = "Stop"

function Fail($Message) {
  Write-Error $Message
  exit 1
}

function Find-SignTool {
  $candidates = @()
  $kitsRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"

  if (Test-Path -LiteralPath $kitsRoot) {
    $candidates += Get-ChildItem -LiteralPath $kitsRoot -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
      Sort-Object FullName -Descending |
      Select-Object -ExpandProperty FullName
  }

  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) {
    $candidates += $command.Source
  }

  $candidates | Select-Object -First 1
}

function Import-CodeSigningCertificate {
  if ($env:WINDOWS_CERTIFICATE_THUMBPRINT) {
    return ($env:WINDOWS_CERTIFICATE_THUMBPRINT -replace "\s", "")
  }

  $encodedCertificate = $env:WINDOWS_CERTIFICATE_BASE64
  if (-not $encodedCertificate) {
    $encodedCertificate = $env:WINDOWS_CERTIFICATE
  }

  if (-not $encodedCertificate) {
    if ($env:CI -eq "true") {
      Fail "Missing Windows Authenticode signing material. Set WINDOWS_CERTIFICATE_BASE64 (or WINDOWS_CERTIFICATE) and WINDOWS_CERTIFICATE_PASSWORD, or set WINDOWS_CERTIFICATE_THUMBPRINT on the runner."
    }

    Write-Host "No Windows Authenticode certificate configured; leaving $TargetPath unsigned."
    exit 0
  }

  if (-not $env:WINDOWS_CERTIFICATE_PASSWORD) {
    Fail "WINDOWS_CERTIFICATE_PASSWORD is required when WINDOWS_CERTIFICATE_BASE64 or WINDOWS_CERTIFICATE is set."
  }

  $certificateDir = Join-Path ([System.IO.Path]::GetTempPath()) ("usagebar-signing-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $certificateDir | Out-Null
  $certificatePath = Join-Path $certificateDir "certificate.pfx"

  try {
    $normalizedCertificate = $encodedCertificate -replace "\s", ""
    [System.IO.File]::WriteAllBytes($certificatePath, [Convert]::FromBase64String($normalizedCertificate))

    $securePassword = ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -Force -AsPlainText
    $certificate = Import-PfxCertificate -FilePath $certificatePath -CertStoreLocation Cert:\CurrentUser\My -Password $securePassword

    if (-not $certificate.Thumbprint) {
      Fail "Windows certificate import did not return a thumbprint."
    }

    return ($certificate.Thumbprint -replace "\s", "")
  } finally {
    Remove-Item -LiteralPath $certificateDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path -LiteralPath $TargetPath)) {
  Fail "Signing target does not exist: $TargetPath"
}

$thumbprint = Import-CodeSigningCertificate

$signtool = Find-SignTool
if (-not $signtool) {
  Fail "signtool.exe was not found. Install the Windows SDK on the signing runner."
}

$timestampUrl = $env:WINDOWS_TIMESTAMP_URL
if (-not $timestampUrl) {
  $timestampUrl = "http://timestamp.digicert.com"
}

Write-Host "Signing $TargetPath with certificate thumbprint $thumbprint"

& $signtool sign /sha1 $thumbprint /fd SHA256 /tr $timestampUrl /td SHA256 $TargetPath
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& $signtool verify /pa /all $TargetPath
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
