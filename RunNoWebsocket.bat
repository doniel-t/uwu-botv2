del "*.log" /q /f
ts-node . > %date:~-4%_%date:~3,2%_%date:~0,2%__%time:~1,1%_%time:~3,2%_%time:~6,2%.log