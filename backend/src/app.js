const express = require("express");
const cors = require("cors");

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// 테스트 라우트
app.get("/", (req, res) => {
    res.send("QRush backend server running");
});

module.exports = app;