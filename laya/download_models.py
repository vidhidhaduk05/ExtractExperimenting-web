import os
import sys
import urllib.request

REPO = "receptron/laya-onnx"
BASE_URL = f"https://huggingface.co/{REPO}/resolve/main/"
FILES = [
    "laya.onnx",
    "laya.onnx.data",
    "laya_config.json",
    "tokenizer/tokenizer.json",
    "tokenizer/tokenizer_config.json"
]

dest_dir = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(dest_dir, exist_ok=True)

print(f"Downloading Laya ONNX bundle to: {dest_dir}")
for rel_path in FILES:
    dest_path = os.path.join(dest_dir, rel_path)
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    url = BASE_URL + rel_path
    
    if os.path.exists(dest_path):
        size_mb = os.path.getsize(dest_path) / (1024 * 1024)
        print(f"  [Exists] {rel_path} ({size_mb:.2f} MB)")
        continue
        
    print(f"  [Downloading] {rel_path} from {url} ...")
    def reporthook(block_num, block_size, total_size):
        if total_size > 0:
            downloaded = block_num * block_size
            pct = min(100.0, downloaded * 100.0 / total_size)
            if block_num % 5000 == 0:
                print(f"    ... {downloaded / (1024*1024):.1f} MB / {total_size / (1024*1024):.1f} MB ({pct:.1f}%)")
    try:
        urllib.request.urlretrieve(url, dest_path, reporthook=reporthook)
        print(f"  [Done] {rel_path}")
    except Exception as e:
        print(f"  [Error] Failed to download {rel_path}: {e}")
        if os.path.exists(dest_path):
            os.remove(dest_path)
        sys.exit(1)

print("All files downloaded successfully.")
