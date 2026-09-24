"""Print the SHA-256 / SHA-1 fingerprint of every signing certificate in an APK's
signing block, per scheme (v2 / v3 / v3.1 / v3.2 hybrid PQC). apksigner can't
parse the ML-DSA signer, but the certificate is just DER bytes and its
fingerprint is what Firebase compares against."""
import hashlib, struct, sys

data = open(sys.argv[1], 'rb').read()

# End of central directory → central directory offset → signing block magic.
eocd = data.rfind(b'PK\x05\x06')
cd_off = struct.unpack_from('<I', data, eocd + 16)[0]
assert data[cd_off - 16:cd_off] == b'APK Sig Block 42', 'no APK signing block'
size = struct.unpack_from('<Q', data, cd_off - 24)[0]
start = cd_off - size - 8
assert struct.unpack_from('<Q', data, start)[0] == size
pos, end = start + 8, cd_off - 24

NAMES = {0x7109871A: 'v2', 0xF05368C0: 'v3', 0x1B93AD61: 'v3.1', 0x42726577: 'padding',
         0x6DFF800D: 'source stamp v2', 0x2B09189E: 'source stamp v1'}

def u32(b, o): return struct.unpack_from('<I', b, o)[0]

def certs_from_signers(value):
    """value = len-prefixed signers seq; each signer = len-prefixed, starting
    with len-prefixed signed_data = [digests seq][certificates seq]..."""
    out = []
    signers_len = u32(value, 0); p = 4; stop = 4 + signers_len
    while p < stop:
        slen = u32(value, p); signer = value[p + 4:p + 4 + slen]; p += 4 + slen
        sd_len = u32(signer, 0); sd = signer[4:4 + sd_len]
        dg_len = u32(sd, 0); q = 4 + dg_len            # skip digests
        certs_len = u32(sd, q); q += 4; cstop = q + certs_len
        while q < cstop:
            clen = u32(sd, q); der = sd[q + 4:q + 4 + clen]; q += 4 + clen
            out.append(der)
        # minSdk/maxSdk follow in v3+; try to read them for context
        min_sdk = u32(sd, q) if q + 8 <= len(sd) else None
        max_sdk = u32(sd, q + 4) if q + 8 <= len(sd) else None
        yield out, (min_sdk, max_sdk)
        out = []

def fp(der, algo):
    h = getattr(hashlib, algo)(der).hexdigest().upper()
    return ':'.join(h[i:i + 2] for i in range(0, len(h), 2))

def key_algo(der):
    # crude: look for the ML-DSA / RSA / EC OIDs in the DER
    if b'\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01' in der: return 'RSA'
    if b'\x2a\x86\x48\xce\x3d\x02\x01' in der: return 'EC'
    if b'\x60\x86\x48\x01\x65\x03\x04\x03' in der: return 'ML-DSA (post-quantum)'
    return 'unknown'

while pos < end:
    plen = struct.unpack_from('<Q', data, pos)[0]
    bid = u32(data, pos + 8)
    value = data[pos + 12:pos + 8 + plen]
    name = NAMES.get(bid, f'unknown id 0x{bid:08X}')
    print(f'\nblock {name} ({len(value)} bytes)')
    if name in ('padding', 'source stamp v1', 'source stamp v2'):
        pos += 8 + plen; continue
    try:
        for certs, (mn, mx) in certs_from_signers(value):
            print(f'  signer: minSdk={mn} maxSdk={mx}')
            for der in certs:
                print(f'    cert {key_algo(der)}')
                print(f'      SHA-256 {fp(der, "sha256")}')
                print(f'      SHA-1   {fp(der, "sha1")}')
    except Exception as e:  # noqa: BLE001
        print(f'  could not parse as signer block: {e!r}')
    pos += 8 + plen
