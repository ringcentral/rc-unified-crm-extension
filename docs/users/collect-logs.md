# Collect error logs

The best way for us to fix a bug is being able to reproduce it first. For that to happen, collecting error logs is the key. If you are looking at this page right now, allow me to express my thanks to you on helping make things easier.

There are 3 things we like the most: console logs, network logs and screen recordings.

## 1. Console logs

To collect console logs:

1. If possible, please manually trigger the error if you can stably reproduce it
2. Right click on App Connect extension and "Inspect"
3. Switch to "Console" tab and copy ALL content. 

## 2. Network logs

To collect network logs:

1. Right click on App Connect extension and "Inspect"
2. Swtich to "Network" tab
3. Trigger the error
4. Save network log as HAR file

![](../img//save-har-file.png)


## 3. Screen recordings

Screen recording would be able to show great observation on what actually happened on user's machine.

To record your screen and share the recording to us, it's recommended to use tools like [Loom](https://chromewebstore.google.com/detail/loom-%E2%80%93-screen-recorder-sc/liecbddmkiiihnedobmlmillhodjkdmb) which generates a sharable link after recorded.