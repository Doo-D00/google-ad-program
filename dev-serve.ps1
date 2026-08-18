# dev-serve.ps1 — docs/ 를 http://localhost:8765/ 로 띄우는 개발용 정적 서버.
#
# file:// 로 열면 ES 모듈과 Google 로그인(OAuth 원본 검사)이 동작하지 않는다.
# 로컬에서 테스트하려면 이 스크립트로 띄운 뒤, Cloud Console 의 OAuth 클라이언트에
# "승인된 JavaScript 원본" 으로 http://localhost:8765 를 함께 등록해 두면 된다.
#
# 사용: powershell -ExecutionPolicy Bypass -File dev-serve.ps1

$root = Join-Path $PSScriptRoot 'docs'
$prefix = 'http://localhost:8765/'

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "docs/ 를 $prefix 에서 서빙합니다. (Ctrl+C 로 종료)"

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.LocalPath).TrimStart('/')
  if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
  $file = Join-Path $root $rel

  if (Test-Path -LiteralPath $file -PathType Leaf) {
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    $ct = $types[$ext]
    if (-not $ct) { $ct = 'application/octet-stream' }
    $ctx.Response.ContentType = $ct
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
