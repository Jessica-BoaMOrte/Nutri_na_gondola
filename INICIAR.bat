@echo off
cd /d "%~dp0"
where py >nul 2>nul && goto usarpy
where python >nul 2>nul && goto usarpython
echo Python nao foi encontrado neste computador.
echo Instale em https://www.python.org/downloads/ (marque "Add python.exe to PATH") e abra este arquivo de novo.
pause
exit /b
:usarpy
py servidor\app.py --abrir
pause
exit /b
:usarpython
python servidor\app.py --abrir
pause
