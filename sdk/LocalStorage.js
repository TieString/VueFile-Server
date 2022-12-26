const os = require('os'),
    nodePath = require('path'),
    path = require('path'),
    fs = require('fs'),
    util = require('util'),
    rimraf = util.promisify(require('rimraf')),
    multiparty = require('multiparty'),
    mime = require('mime'),
    { sleep, getFileMimeType } = require('./file')
class LocalStorage {
    constructor(root) {
        this.code = 'local'
        this.receivedChunkCount = 0
        if (root) {
            this.root = root
        } else if (process.env.FILEBROWSER_LOCAL_ROOT_PATH) {
            this.root = nodePath.resolve(process.cwd(), process.env.FILEBROWSER_LOCAL_ROOT_PATH)
        } else {
            this.root = os.homedir()
        }
    }

    async list(path) {
        try {
            let dirs = [],
                files = []

            if (path[path.length - 1] !== '/') {
                path += '/'
            }
            let items = await fs.promises.readdir(this.root + path, { withFileTypes: true })

            for (let item of items) {
                let isFile = item.isFile(),
                    isDir = item.isDirectory()

                if (!isFile && !isDir) {
                    continue
                }

                let result = {
                    type: isFile ? 'file' : 'dir',
                    path: path + item.name,
                }

                result.basename = result.name = nodePath.basename(result.path)

                if (isFile) {
                    let fileStat = await fs.promises.stat(this.root + result.path)
                    result.size = fileStat.size
                    result.extension = nodePath.extname(result.path).slice(1)
                    result.name = nodePath.basename(result.path, '.' + result.extension)
                    files.push(result)
                } else {
                    result.path += '/'
                    dirs.push(result)
                }
            }

            return dirs.concat(files)
        } catch (err) {
            console.error(err)
        }
    }

    async upload(path, files) {
        try {
            for (let file of files) {
                await fs.promises.rename(file.path, this.root + path + file.originalname)
            }
        } catch (err) {
            console.error(err)
        }
    }

    // 下载
    async download(req, res) {
        try {
            const fullPath = this.root + req.query.path
            const stat = await fs.promises.lstat(fullPath)
            if (stat.isFile()) {
                const range = req.headers.range
                if (!range) {
                    await res.download(fullPath)
                    return
                }
                /* 开始断点续传 */
                // 解析 HTTP Range 请求头，获取文件范围
                const parts = range.replace(/bytes=/, '').split('-')
                const start = parseInt(parts[0], 10)
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
                const chunksize = end - start + 1

                // 读取文件，并返回指定范围的内容
                const file = fs.createReadStream(file, { start, end })
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'text/plain',
                })
                file.pipe(res)

                app.listen(3000, () => {
                    console.log('Server is listening on port 3000')
                })
            } else {
                throw new Error(`Cannot download a directory: ${path}`)
            }
        } catch (err) {
            console.error(err)
        }
    }

    async mkdir(path) {
        await fs.promises.mkdir(this.root + path, { recursive: true })
    }

    async delete(path) {
        try {
            let stat = await fs.promises.lstat(this.root + path),
                isDir = stat.isDirectory(),
                isFile = stat.isFile()

            if (isFile) {
                await fs.promises.unlink(this.root + path)
            } else if (isDir) {
                await rimraf(this.root + path)
            }
        } catch (err) {
            console.error(err)
        }
    }

    /**
     * 文件上传 - 分片上传
     * @param {Object} req 客户端传入参数
     */
    multipartyUpload = async (req, res) => {
        try {
            let { hash, name, type } = req.query
            let dir = `${path.join(__dirname, '../')}upload/${hash}`
            // 文件是否已经上传过
            let realPath = `${dir}.${mime.extension(type)}`
            if (fs.existsSync(realPath)) {
                return new Promise(function (resolve, _reject) {
                    resolve({ code: 0, msg: '文件已经存在，无需上传', path: realPath })
                })
            }

            let chunkPath = `${dir}/${name}` // 切片路径 判断切片是否上传过
            if (fs.existsSync(chunkPath)) {
                return new Promise(function (resolve, _reject) {
                    resolve({ code: 1, msg: '切片已存在，跳过此切片', path: chunkPath })
                })
            } else {
                // 继续上传
                let { hash, name } = req.query
                let form = new multiparty.Form({})
                form.uploadDir = process.env.FILEBROWSER_UPLOAD_PATH
                let { fields, files } = await new Promise((resolve, reject) => {
                    form.parse(req, (err, fields, files) => {
                        if (err) return reject(err)
                        return resolve({ fields, files })
                    })
                })
                let file = files.file[0]
                let dir = `${path.join(__dirname, '../')}upload/${hash}`
                if (!fs.existsSync(dir)) {
                    try {
                        fs.mkdirSync(dir)
                    } catch (err) {
                        throw new Error(`Failed to create directory ${dir}: ${err}`)
                    }
                }
                let savePath = `${dir}/${name}`
                try {
                    fs.renameSync(file.path, savePath)
                    this.receivedChunkCount++
                } catch (err) {
                    throw new Error(`Failed to move file from ${file.path} to ${savePath}: ${err}`)
                }
                file.realPath = savePath
                return { fields, files }
            }
        } catch (err) {
            console.error(err)
            throw err
        }
    }

    /**
     * @description 文件上传分片文件合并
     * @author TieString
     * @date 2022/12/26
     * @param {*} req 客户端传入参数
     * @param {*} res response
     * @memberof LocalStorage 存储
     */
    multipartyFileMerge = async (req, res) => {
        let { hash, type, name, chunksCount } = req.query
        let partsDir = `${path.join(__dirname, '../')}upload\\${hash}`
        // 文件是否已经上传过
        let fullPath = `${partsDir}.${mime.extension(type)}`
        // try {
        //     if (fs.existsSync(realPath)) {
        //         res.status(200).json({ realPath, msg: '文件已存在，无需合并！' })
        //         return
        //     }
        // } catch {
        while (this.receivedChunkCount !== parseInt(chunksCount)) await sleep(100)

        let fileList = fs.readdirSync(partsDir)
        fileList.sort((a, b) => a - b)
        fileList.forEach((item) => {
            const itemDir = `${partsDir}/${item}`
            fs.appendFileSync(fullPath, fs.readFileSync(itemDir))
            fs.unlinkSync(itemDir)
        })
        fs.rmdirSync(partsDir)
        // await fs.promises.rename(fullPath, `files/${name}`)
        this.receivedChunkCount = 0
        res.status(200).json({ path: fullPath, msg: '合并成功！' })
        // }
        return
    }
}

module.exports = LocalStorage
