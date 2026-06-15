const express = require("express");
const cors = require("cors");

// 1. 라우터 파일 먼저 불러오기
const gateRoutes = require("./routes/gate");
const ticketRoutes = require("./routes/ticket");
const vcRoutes = require("./routes/vc");
const bookingRoutes = require("./routes/booking");

const app = express();

// 2. 미들웨어 (항상 라우터 연결보다 위)
app.use(cors());
app.use(express.json({ limit: "1mb" })); // proof JSON이 커서 limit 여유

// 3. 라우터 연결
app.use("/api/gate", gateRoutes);
app.use("/api/ticket", ticketRoutes);
app.use("/api/vc", vcRoutes);
app.use("/api/booking", bookingRoutes);

// 4. 테스트 라우트
app.get("/", (req, res) => {
  res.send("QRush backend server running");
});

module.exports = app;
