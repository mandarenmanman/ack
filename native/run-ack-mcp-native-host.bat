@echo off
setlocal

REM Native Messaging hosts require stdio; this wrapper starts the Node-based host.
set SCRIPT_DIR=%~dp0
set HOST_JS=%SCRIPT_DIR%ack-mcp-native-host.js

REM Use `node` from PATH.
node "%HOST_JS%"

endlocal

