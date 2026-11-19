"""Run the real WeChat engine (OpenCV contrib wechat_qrcode, native C++) over the bench dataset."""
import json, sys, time, os
import numpy as np
import cv2

out_dir = sys.argv[1]
threads = int(sys.argv[2]) if len(sys.argv) > 2 else 1
cv2.setNumThreads(threads)
dl = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'models', '_dl')
det = cv2.wechat_qrcode_WeChatQRCode(*(os.path.join(dl, f) for f in ['detect.prototxt', 'detect.caffemodel', 'sr.prototxt', 'sr.caffemodel']))
manifest = json.load(open(os.path.join(out_dir, 'manifest.json'), encoding='utf8'))
res = {}
for s in manifest:
    img = cv2.imread(os.path.join(out_dir, 'data', s['id'] + '.pgm'), cv2.IMREAD_GRAYSCALE)
    det.detectAndDecode(img) if s is manifest[0] else None  # warm-up
    t = time.perf_counter()
    texts, _ = det.detectAndDecode(img)
    ms = (time.perf_counter() - t) * 1000
    res[s['id']] = {'ok': bool(s['text']) and s['text'] in list(texts), 'false': (not s['text']) and len(texts) > 0, 'ms': ms}
json.dump(res, open(os.path.join(out_dir, f'wechat_t{threads}.json'), 'w'))
print('wechat done', threads, 'thread(s)', cv2.__version__)
