export const mockHolderProfile = {
  holderDid: 'did:qrush:user-demo001',
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  publicKey: 'mock-public-key-demo001',
};

export const mockTickets = [
  {
    tokenId: '100241',
    eventTitle: '이화여대 대동제 초청 공연',
    eventDate: '2026-06-12 19:30',
    seat: 'A3',
    status: 'VALID',
  },
  {
    tokenId: '100198',
    eventTitle: 'QRush Showcase Night',
    eventDate: '2026-06-18 20:00',
    seat: 'C2',
    status: 'USED',
  },
];

export const sampleVcPayload = {
  vc: {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'QRushIdentityCredential'],
    issuer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    issuanceDate: '2026-05-28T00:00:00.000Z',
    credentialSubject: {
      id: 'did:qrush:user-demo001',
      name: '홍길동',
      birthdate: '2001-01-01',
    },
  },
  issuer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  vcHash: '19733513790785789764798600664083567016339786137891631570981147804767237089962',
};
