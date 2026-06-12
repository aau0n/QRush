const Ticket = require("../models/Ticket");

exports.mintTicket = async (req, res) => {
    try {
        const {
            eventId,
            seatId,
            buyerWallet
        } = req.body;

        // 나중에 NFT 발행 후 실제 tokenId 사용
        const tokenId = Date.now().toString();

        const ticket = await Ticket.create({
            eventId,
            seatId,
            buyerWallet,
            tokenId,
            status: "VALID"
        });

        res.status(201).json({
            success: true,
            ticket
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};