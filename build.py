"""把 src/desk.html 和数据层拼成两个可直接使用的网页：
   index.html          浏览器本地版（GitHub Pages 发布的就是它）
   google/Index.html   Google Apps Script 版（数据存 Google 表格）
用法：python3 build.py"""
import os
here=os.path.dirname(os.path.abspath(__file__))
rd=lambda p:open(os.path.join(here,p),encoding='utf-8').read()
src=rd('src/desk.html')
i=src.index('<div class="wrap">')
head,body=src[:i],src[i:]
reset='<style>:root{box-sizing:border-box}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style>'
def doc(shim,extra=''):
    return ('<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            +extra+reset+'\n'+head+'</head>\n<body>\n<script>\n'+shim+'\n</script>\n'+body+'\n</body>\n</html>\n')
desc='<meta name="description" content="Sophia\'s Desk：日程与会议议题、月/周/日目标、速记和知识库的个人工作台。数据只存在你自己的浏览器里。">\n'
open(os.path.join(here,'index.html'),'w',encoding='utf-8').write(doc(rd('src/local-shim.js'),desc))
open(os.path.join(here,'google/Index.html'),'w',encoding='utf-8').write(doc(rd('google/shim.js')))
print('built index.html and google/Index.html')
