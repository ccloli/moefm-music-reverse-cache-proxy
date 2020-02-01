#!/usr/bin/node

const fs = require('fs');
const http = require('http');
const url = require('url');
const path = require('path');
// const { PassThrough } = require('stream');

const reqCache = {};

const server = http.createServer((req, res) => {
    const host = req.headers['host'];
    console.log(`${new Date().toISOString()} ${req.connection.remoteAddress}${req.headers['x-forwarded-for'] ? `[${req.headers['x-forwarded-for']}]` : ''} - ${req.url}`);
    /*if (host.indexOf('moefm.ccloli.com') < 0) {
        res.writeHead(403, 'Forbidden');
        res.end();
        return;
    }*/

    const pathname = url.parse(req.url).pathname.replace(/^\//, '');
    const localPathname = path.resolve(pathname);

    if (reqCache[pathname]) {
        console.log(`CACHING ${pathname}`);
        const resHeader = {};
        for (let i = 0, len = reqCache[pathname].rawHeaders.length; i < len; i += 2) {
            resHeader[reqCache[pathname].rawHeaders[i]] = reqCache[pathname].rawHeaders[i + 1];
        }
        resHeader['X-Cache'] = 'CACHING from ccloli.is.a.lolicon.cc';
        // resHeader['Accept-Ranges'] = 'none';
        resHeader['Last-Modified'] = resHeader['Last-Modified'] || new Date().toUTCString();
        if (req.headers['range']) {
            console.log('Range: ' + req.headers['range']);
            const bytes = req.headers['range'].split('bytes=')[1].split(/,\s*/);
            if (bytes.length === 1) {
                const [start, end] = bytes[0].split('-');
                const config = {
                    start: +start
                };
                if (end && +end > +start) {
                    config.end = +end;
                }
                const length = +resHeader['Content-Length'];

                res.writeHead(206, 'Partial Content', {
                    'Content-Type': 'audio/mpeg',
                    'Cache-Control': 'public, max-age=31536000',
                    'Last-Modified': resHeader['Last-Modified'] || new Date().toUTCString(),
                    'Content-Range': `bytes ${start}-${end || length - 1}/${length}`,
                    'Content-Length': end ? end - start : length - start,
                    'ETag': resHeader['ETag'],
                    'X-Cache': 'CACHING from ccloli.is.a.lolicon.cc'
                });
                let offset = 0;
                reqCache[pathname].temp.forEach(e => {
                    if (offset === -1) {
                        res.write(e);
                    }
                    else if (offset + e.length >= start) {
                        const index = start - offset;
                        res.write(e.slice(index));
                        offset = -1;
                    }
                    else {
                        offset += e.length;
                    }
                });
                reqCache[pathname].on('data', (buffer) => {
                    if (offset === -1) {
                        res.write(buffer);
                    }
                    else if (offset + buffer.length >= start) {
                        const index = start - offset;
                        res.write(buffer.slice(index));
                        offset = -1;
                    }
                    else {
                        offset += buffer.length;
                    }
                });
                reqCache[pathname].on('end', () => {
                    res.end();
                });
                return;
            }
        }
        res.writeHead(reqCache[pathname].statusCode, reqCache[pathname].statusMessage, resHeader);
        reqCache[pathname].temp.forEach(e => res.write(e));
        reqCache[pathname].on('data', (buffer) => {
            res.write(buffer);
        });
        reqCache[pathname].on('end', () => {
            res.end();
        });
        return;
    }

    fs.stat(localPathname, (statErr, stat) => {
        if (statErr || !stat || !stat.isFile()) {
            if ((statErr && statErr.code === 'ENOENT') || !stat || !stat.isFile()) {
                console.log(`MISS ${pathname}`);

                let forwardedFor = req.connection.remoteAddress;
                let remoteIP = req.connection.remoteAddress;
                if (req.headers['x-forwarded-for']) {
                    forwardedFor = `${req.headers['x-forwarded-for']}`;
                    remoteIP = req.headers['x-forwarded-for'].split(',', 2).shift();
                }
                //console.log(forwardedFor, remoteIP);

                const request = http.request({
                    host: '222.186.161.105',
                    port: 80,
                    path: 'http://nyan.90g.org' + req.url,
                    headers: {
                        Host: 'nyan.90g.org',
                        DNT: '1',
                        'User-Agent': (req.headers['user-agent'] || '') + ' MoeFM-HTML5-Project-Reverse-Proxy/0.1.1',
                        'X-Forwarded-For': forwardedFor,
                        'X-Real-IP': remoteIP
                    }
                }, (response) => {
                    const curTime = new Date();
                    const resHeader = {};
                    for (let i = 0, len = response.rawHeaders.length; i < len; i += 2) {
                        resHeader[response.rawHeaders[i]] = response.rawHeaders[i + 1];
                    }
                    resHeader['X-Cache'] = 'MISS from ccloli.is.a.lolicon.cc';
                    // resHeader['Accept-Ranges'] = 'none';
                    if (response.statusCode !== 200 || !/\.mp3$/.test(pathname)) {
                        res.writeHead(response.statusCode, response.statusMessage, resHeader);
                        response.pipe(res, {end: true});
                        return;
                    }

                    const dirList = path.dirname(pathname).split('/').filter(e => e);
                    dirList.reduce((pre, cur) => {
                        try {
                            fs.mkdirSync(path.resolve(pre, cur));
                        } catch(err) {
                            if (err.code !== 'EEXIST') {
                                console.log(err);
                            }
                        }
                        return pre + '/' + cur
                    }, __dirname);

                    reqCache[pathname] = response;
                    response.temp = [];
                    const writeStream = fs.createWriteStream(localPathname + '.tmp');
                    resHeader['Last-Modified'] = resHeader['Last-Modified'] || curTime.toUTCString();
                    res.writeHead(response.statusCode, response.statusMessage, resHeader);
                    response.on('data', (buffer) => {
                        response.temp.push(buffer);
                    });
                    response.pipe(writeStream, { end: true });
                    response.pipe(res, { end: true });
                    writeStream.on('close', () => {
                        if (+resHeader['Content-Length'] !== response.temp.reduce((pre, buffer) => (pre + buffer.length), 0)) {
                            console.log(`${pathname} file size mismatch, dropped`);
                            delete reqCache[pathname];
                            fs.unlink(localPathname + '.tmp', (err) => {
                                if (err) {
                                    console.dir(err);
                                }
                            });
                            return;
                        }
                        fs.rename(localPathname + '.tmp', localPathname, (err) => {
                            if (err) {
                                console.dir(err);
                            }
                            fs.utimes(localPathname, curTime, new Date(resHeader['Last-Modified'] || curTime.getTime()), (error) => {
                                if (error) {
                                    console.dir(error);
                                }
                            });
                            delete reqCache[pathname];
                        });
                    });
                    response.on('error', (err) => {
                        console.dir(err);
                        res.end();
                    });
                    writeStream.on('error', (err) => {
                        console.dir(err);
                    });
                });
                request.end();
                return;
            }

            console.dir(statErr);
            res.writeHead(500, 'Internal Server Error');
            res.end();
            return;
        }

        console.log(`HIT ${pathname}`);
        const lastModified = req.headers['if-modified-since'];
        if (Date.parse(lastModified) >= Date.parse(stat.mtime)) {
            console.log(`If-Modified-Since: ${lastModified} -> 304 Not Modified`);
            res.writeHead(304, 'Not Modified', {
                'X-Cache': 'HIT from ccloli.is.a.lolicon.cc'
            });
            res.end();
            return;
        }

        if (req.headers['range']) {
            console.log('Range: ' + req.headers['range']);
            const bytes = req.headers['range'].split('bytes=')[1].split(/,\s*/);
            if (bytes.length === 1) {
                const [start, end] = bytes[0].split('-');
                const config = {
                    start: +start
                };
                if (end && +end > +start) {
                    config.end = +end;
                }

                res.writeHead(206, 'Partial Content', {
                    'Content-Type': 'audio/mpeg',
                    'Cache-Control': 'public, max-age=31536000',
                    'Last-Modified': new Date(stat.mtime).toUTCString(),
                    'Content-Range': `bytes ${start}-${end || stat.size - 1}/${stat.size}`,
                    'Content-Length': end ? end - start : stat.size - start,
                    'ETag': '"' + parseInt(Date.parse(stat.mtime) / 1e3, 10).toString(16) + '-' + stat.size.toString(16) + '"',
                    'X-Cache': 'HIT from ccloli.is.a.lolicon.cc'
                });
                const stream = fs.createReadStream(localPathname, config);
                stream.pipe(res, { end: true });
                stream.on('error', (err) => {
                    console.dir(err);
                    res.end();
                });
                return;
            }

            res.writeHead(206, 'Partial Content', {
                'Content-Type': 'multipart/byteranges; boundary=ccloli-is-a-lolicon',
                'Cache-Control': 'public, max-age=31536000',
                'Last-Modified': new Date(stat.mtime).toUTCString(),
                // 'Content-Range': `bytes ${start}-${end || stat.size - 1}/${stat.size}`,
                // 'Content-Length': end ? end - start : stat.size - start,
                'ETag': '"' + parseInt(Date.parse(stat.mtime) / 1e3, 10).toString(16) + '-' + stat.size.toString(16) + '"',
                'X-Cache': 'HIT from ccloli.is.a.lolicon.cc'
            });
            const gonext = () => {
                const e = bytes.shift();
                if (e) {
                    resolve(e);
                }
                else {
                    res.write('--ccloli-is-a-lolicon--');
                    res.end();
                }
            }
            const resolve = (e) => {
                const [start, end] = e.split('-');
                const config = {
                    start: +start
                };
                if (end && +end > +start) {
                    config.end = +end;
                }

                res.write(`--ccloli-is-a-lolicon\r\nContent-Type: audio/mpeg\r\nContent-Range: bytes ${start}-${end || stat.size - 1}/${stat.size}\r\n\r\n`);
                const stream = fs.createReadStream(localPathname, config);
                stream.on('data', (buffer) => {
                    res.write(buffer);
                });
                stream.on('close', () => {
                    res.write('\r\n');
                    gonext();
                });
                stream.resume();
            };
            gonext();
            return;
        }

        res.writeHead(200, 'OK', {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=31536000',
            'Last-Modified': new Date(stat.mtime).toUTCString(),
            'Content-Length': stat.size,
            'ETag': '"' + parseInt(Date.parse(stat.mtime) / 1e3, 10).toString(16) + '-' + stat.size.toString(16) + '"',
            'X-Cache': 'HIT from ccloli.is.a.lolicon.cc'
        });
        const stream = fs.createReadStream(localPathname);
        stream.pipe(res, { end: true });
        stream.on('error', (err) => {
            console.dir(err);
            res.end();
        })
    });
});

server.on('error', (err) => {
    console.log(err);
})

server.listen(2333, '127.0.0.1', () => {
    console.log('Server Listening on 2333');
});

