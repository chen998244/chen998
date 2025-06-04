@echo off
chcp 65001
echo 正在启动飞机大战游戏...

:: 检查是否已安装 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误：未找到 Node.js，请先安装 Node.js
    pause
    exit /b
)

:: 检查是否已安装依赖
if not exist node_modules (
    echo 正在安装依赖...
    call npm install
)

:: 启动服务器
start cmd /k "npm start"

:: 等待服务器启动
timeout /t 2 /nobreak >nul

:: 打开浏览器
start http://localhost:3000

echo 游戏已启动！
echo 请在浏览器中开始游戏