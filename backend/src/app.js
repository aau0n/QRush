const express = require("express");
const cors = require("cors");

// 1. 라우터 파일 먼저 불러오기 (여기가 중요합니다!)
const gateRoutes = require("./routes/gate");
const ticketRoutes = require("./routes/ticket");

const app = express();

// 2. 미들웨어 설정 (항상 라우터 연결보다 위에 있어야 함)
app.use(cors());
app.use(express.json()); // 이 줄이 req.body를 읽게 해줍니다.

// 3. 라우터 연결
app.use("/api/gate", gateRoutes);
app.use("/api/ticket", ticketRoutes);

// 4. 테스트 라우트
app.get("/", (req, res) => {
    res.send("QRush backend server running");
});

module.exports = app;
