[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedProjectRef = 'rwedeejhjazwjthdjzrt'
$expectedCanonicalLfHash = '260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13'
$expectedWindowsCrlfHash = '5FCE2EEE8D21A29C68D7685A744234EAC779FB7BB4D92B6E59CBCBD109826970'
$expectedConfirmation = "APPLY P0 $expectedProjectRef $expectedCanonicalLfHash"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$migrationPath = Join-Path $repositoryRoot 'supabase\migrations\20261011155623_appointment_access_tokens_table_access_hardening.sql'
$wrapperPath = Join-Path $repositoryRoot 'scripts\sql\apply-appointment-token-hardening-staging.sql'

$databaseUrl = [Environment]::GetEnvironmentVariable('LARI_STAGING_DATABASE_URL')
$confirmation = [Environment]::GetEnvironmentVariable('LARI_P0_CONFIRMATION')

if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    throw 'LARI_STAGING_DATABASE_URL is required.'
}
if ($confirmation -cne $expectedConfirmation) {
    throw 'LARI_P0_CONFIRMATION does not match the one-time protected-project confirmation.'
}

$uri = [Uri]$databaseUrl
if ($uri.Scheme -notin @('postgres', 'postgresql')) {
    throw 'The staging connection must use PostgreSQL.'
}
if ($uri.Host -in @('127.0.0.1', 'localhost', '::1')) {
    throw 'The protected staging cutover must not target loopback.'
}
$connectionIdentity = "$($uri.UserInfo)@$($uri.Host)"
if (-not $connectionIdentity.Contains($expectedProjectRef, [StringComparison]::Ordinal)) {
    throw 'The staging connection identity does not match the protected project reference.'
}

$actualRawHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $migrationPath).Hash
if ($actualRawHash -cnotin @($expectedCanonicalLfHash, $expectedWindowsCrlfHash)) {
    throw 'The appointment-token hardening migration raw checksum does not match an exact Git LF or Windows CRLF representation.'
}

$migrationText = [System.IO.File]::ReadAllText($migrationPath)
$crlf = [string][char]13 + [char]10
$lf = [string][char]10
$normalizedLf = $migrationText.Replace($crlf, $lf)
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $actualCanonicalLfHash = ([BitConverter]::ToString($sha256.ComputeHash($utf8NoBom.GetBytes($normalizedLf)))).Replace('-', '')
}
finally {
    $sha256.Dispose()
}
if ($actualCanonicalLfHash -cne $expectedCanonicalLfHash) {
    throw 'The appointment-token hardening migration canonical LF checksum does not match.'
}

$psql = Get-Command psql -ErrorAction Stop
$previousPgDatabase = [Environment]::GetEnvironmentVariable('PGDATABASE')
$previousPgSslMode = [Environment]::GetEnvironmentVariable('PGSSLMODE')
$previousPgConnectTimeout = [Environment]::GetEnvironmentVariable('PGCONNECT_TIMEOUT')

try {
    [Environment]::SetEnvironmentVariable('PGDATABASE', $databaseUrl)
    [Environment]::SetEnvironmentVariable('PGSSLMODE', 'require')
    [Environment]::SetEnvironmentVariable('PGCONNECT_TIMEOUT', '15')
    $psqlArguments = @(
        '-X',
        '--set=ON_ERROR_STOP=1',
        "--set=expected_project_ref=$expectedProjectRef",
        "--file=$wrapperPath"
    )
    & $psql.Source @psqlArguments

    if ($LASTEXITCODE -ne 0) {
        throw "psql exited with code $LASTEXITCODE."
    }
}
finally {
    [Environment]::SetEnvironmentVariable('PGDATABASE', $previousPgDatabase)
    [Environment]::SetEnvironmentVariable('PGSSLMODE', $previousPgSslMode)
    [Environment]::SetEnvironmentVariable('PGCONNECT_TIMEOUT', $previousPgConnectTimeout)
}
