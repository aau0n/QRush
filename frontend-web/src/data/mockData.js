export const mockEvents = [
  {
    id: 'event-001',
    title: '이화여대 대동제 초청 공연',
    date: '2026-06-12',
    time: '19:30',
    venue: 'ECC 삼성홀',
    price: '0.01 ETH',
    description: 'QRush 데모용 NFT 티켓 예매 공연',
  },
  {
    id: 'event-002',
    title: 'QRush Showcase Night',
    date: '2026-06-18',
    time: '20:00',
    venue: 'Seoul Tech Hall',
    price: '0.015 ETH',
    description: 'ZKP 입장 검증 플로우 시연 행사',
  },
];

export const seatRows = ['A', 'B', 'C', 'D'];

export const mockTickets = [
  {
    tokenId: '100241',
    eventTitle: '이화여대 대동제 초청 공연',
    seat: 'A3',
    status: 'VALID',
  },
  {
    tokenId: '100198',
    eventTitle: 'QRush Showcase Night',
    seat: 'C2',
    status: 'USED',
  },
];
