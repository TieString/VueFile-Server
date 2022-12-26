const { sleep } = require('./file')

const router = require('express').Router(),
    multer = require('multer'),
    path = require('path'),
    mime = require('mime'),
    fs = require('fs')

module.exports = function (storages, options = {}) {
    let uploadPath = options.uploadPath || require('os').tmpdir()
    for (let storage of storages) {
        // `list` endpoint
        router.get(`/${storage.code}/list`, async function (req, res) {
            let result = await storage.list(req.query.path)
            return res.json(result)
        })

        // `upload` endpoint
        router.post(`/${storage.code}/upload`, multer({ dest: uploadPath }).array('files'), async function (req, res) {
            await storage.upload(req.query.path, req.files)
            return res.sendStatus(200)
        })

        // `download` endpoint
        router.get(`/${storage.code}/download`, async function (req, res) {
            await storage.download(req, res)
        })

        // `mkdir` endpoint
        router.post(`/${storage.code}/mkdir`, async function (req, res) {
            await storage.mkdir(req.query.path, req.query.name)
            return res.sendStatus(200)
        })

        // `delete` endpoint
        router.post(`/${storage.code}/delete`, async function (req, res) {
            await storage.delete(req.query.path)
            return res.sendStatus(200)
        })

        /* 断点续传 */
        router.post(`/${storage.code}/multipartyUpload`, (req, res, next) => {
            storage
                .multipartyUpload(req, res)
                .then((value) => {
                    if (value.code == 0)
                        res.status(200).json({ code: value.code, path: value.path, msg: '文件已存在，无需上传！' })
                    else if (value.code == 1)
                        res.status(200).json({ code: value.code, path: value.path, msg: '切片已存在，跳过此切片' })
                    else res.status(200).json(value)

                    return
                })
                .catch((reason) => {
                    res.status(500).json(reason)
                })
        })

        // 合并文件
        router.get(`/${storage.code}/merge`, async (req, res, next) => {
            storage
                .multipartyFileMerge(req, res)
                .then((value) => {
                    res.status(200).json(value)
                })
                .catch((reason) => {
                    res.status(500).json(reason)
                })
        })
    }
    return router
}
