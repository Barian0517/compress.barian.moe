@echo off
rem 強制使用 UTF-8 編碼，避免中文亂碼
chcp 65001 >nul

echo 正在執行 git add . ...
git add .

rem 建立一個臨時的 VBScript 來處理彈窗輸入，徹底避開 Batch 語法解析錯誤
set "vbs=%temp%\git_input.vbs"
echo msg = InputBox("請輸入 commit 內容（留空則直接 commit，不加 -m）：", "請輸入commit內容") > "%vbs%"
echo WScript.Echo msg >> "%vbs%"

rem 執行 VBScript 並讀取使用者輸入的內容
set "msg="
for /f "delims=" %%i in ('cscript //nologo "%vbs%"') do (
    set "msg=%%i"
)

rem 刪除臨時的 VBScript 檔案
del "%vbs%"

rem 檢查使用者是否輸入內容
if "%msg%"=="" (
    echo 使用者未輸入內容，直接執行 git commit ...
    git commit
) else (
    echo 正在執行 git commit -m "%msg%" ...
    git commit -m "%msg%"
)

echo 正在執行 git push origin main ...
git push origin main

echo.
echo 執行完畢！
pause