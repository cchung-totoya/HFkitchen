param([int]$Port = 8765, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $PSScriptRoot).Path.TrimEnd('\')
$rootPrefix = $rootPath + '\'
$baseUrl = "http://127.0.0.1:$Port"
$sha = [Security.Cryptography.SHA256]::Create()
try { $instanceId = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($rootPath.ToLowerInvariant())))).Replace('-', '').Substring(0, 16) }
finally { $sha.Dispose() }
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)

try {
    try { $listener.Start() }
    catch [Net.Sockets.SocketException] {
        if ($_.Exception.SocketErrorCode -ne [Net.Sockets.SocketError]::AddressAlreadyInUse) { throw }
        $sameFolder = $false
        try {
            $probe = [Net.HttpWebRequest][Net.WebRequest]::Create("$baseUrl/")
            $probe.Method = 'HEAD'
            $probe.Timeout = 1500
            $probe.ReadWriteTimeout = 1500
            $reply = $probe.GetResponse()
            try { $sameFolder = $reply.Headers['X-Kitchen-Instance'] -eq $instanceId }
            finally { $reply.Close() }
        } catch { }
        if ($sameFolder) {
            Write-Host '這份專案的本機網站已在執行，已開啟現有畫面。'
            if (-not $NoBrowser) { Start-Process "$baseUrl/" }
            return
        }
        Write-Host "無法啟動這份專案：本機連接埠 $Port 已被另一個程式或其他專案資料夾使用。" -ForegroundColor Yellow
        Write-Host '請關閉先前的 start.cmd 視窗（或在該視窗按 Ctrl+C），再從目前資料夾重新啟動。'
        Write-Host '為了保留同一瀏覽器的學習紀錄，本版不會自動改用其他連接埠。'
        exit 2
    }
    Write-Host "營養科廚房大挑戰：$baseUrl/"
    Write-Host '請保留此視窗；按 Ctrl+C 可停止。'
    if (-not $NoBrowser) { Start-Process "$baseUrl/" }
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
            $request = $reader.ReadLine()
            while ($true) { $header = $reader.ReadLine(); if ($null -eq $header -or $header -eq '') { break } }
            $parts = if ($request) { $request.Split(' ') } else { @() }
            $method = if ($parts.Count -gt 0) { $parts[0] } else { '' }
            $target = if ($parts.Count -gt 1) { $parts[1] } else { '/' }
            $status = '200 OK'
            $body = [byte[]]@()
            $mime = 'text/plain; charset=utf-8'
            if ($method -ne 'GET' -and $method -ne 'HEAD') {
                $status = '405 Method Not Allowed'
            } else {
                try {
                    $uri = [Uri]::new($baseUrl + $target)
                    $relative = [Uri]::UnescapeDataString($uri.AbsolutePath).TrimStart('/')
                    if (-not $relative) { $relative = 'index.html' }
                    $fullPath = [IO.Path]::GetFullPath((Join-Path $rootPath $relative.Replace('/', '\')))
                    if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                        $status = '403 Forbidden'
                    } elseif (-not [IO.File]::Exists($fullPath)) {
                        $status = '404 Not Found'
                    } else {
                        $body = [IO.File]::ReadAllBytes($fullPath)
                        $mime = switch ([IO.Path]::GetExtension($fullPath).ToLowerInvariant()) {
                            '.html' { 'text/html; charset=utf-8' }
                            '.css'  { 'text/css; charset=utf-8' }
                            '.js'   { 'text/javascript; charset=utf-8' }
                            '.csv'  { 'text/csv; charset=utf-8' }
                            '.svg'  { 'image/svg+xml' }
                            '.jpg'  { 'image/jpeg' }
                            '.jpeg' { 'image/jpeg' }
                            '.png'  { 'image/png' }
                            '.webp' { 'image/webp' }
                            '.gif'  { 'image/gif' }
                            default { 'application/octet-stream' }
                        }
                    }
                } catch { $status = '400 Bad Request' }
            }
            if ($status -ne '200 OK') { $body = [Text.Encoding]::UTF8.GetBytes($status) }
            $headers = "HTTP/1.1 $status`r`nContent-Type: $mime`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store, max-age=0`r`nX-Kitchen-Instance: $instanceId`r`nConnection: close`r`n`r`n"
            $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($method -ne 'HEAD' -and $body.Length) { $stream.Write($body, 0, $body.Length) }
            $stream.Flush()
        } catch { Write-Warning $_.Exception.Message }
        finally { $client.Close() }
    }
} finally { $listener.Stop() }
