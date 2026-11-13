"""The publishing kit: the film, the covers, the stills and the copy in one folder and one zip.
   python -X utf8 tools/kit.py            (after  node tools/final.mjs  and  node tools/covers.mjs)
   -> out/TOO_SLOW_publish_kit/  and  out/TOO_SLOW_publish_kit.zip
The stills are tools/snap.mjs frames at 3840x2160 in out/covers/stills (rendered here if they are missing)."""
import os, shutil, subprocess, sys, zipfile

root = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
J = lambda *a: os.path.join(root, *a)
NAME = 'TOO_SLOW_publish_kit'
kit, zpath = J('out', NAME), J('out', NAME + '.zip')
STILLS = [(1.6, '01_ant'), (64.9, '02_time_out'), (68.35, '03_offer'), (87.2, '04_laugh'), (107.6, '05_standoff'), (113.2, '06_storm'),
          (122.9, '07_eye'), (137.2, '08_number_one'), (142.2, '09_eliminated'), (160.9, '10_last_card')]
still = lambda t: J('out', 'covers', 'stills', 't%06.2f.jpg' % t)

if not all(os.path.exists(still(t)) for t, _ in STILLS):
    subprocess.check_call(['node', 'tools/snap.mjs', '--w', '3840', '--h', '2160', '--scale', '2', '--out', 'out/covers/stills'] + [str(t) for t, _ in STILLS], cwd=root)
need = [J('out', 'final', 'TOO_SLOW_4K.mp4'), J('out', 'final', 'TOO_SLOW_1080p.mp4')] + [J('out', 'covers', l, f'{d}_{r}.jpg') for l in ('zh', 'en') for d in ('A_standoff', 'B_eye') for r in ('16x9', '4x3', '3x4', '9x16')]
missing = [p for p in need if not os.path.exists(p)]
if missing: sys.exit('missing:\n  ' + '\n  '.join(missing))

if os.path.isdir(kit): shutil.rmtree(kit)
for d in ('video', 'covers/zh', 'covers/en', 'stills', 'copy'): os.makedirs(os.path.join(kit, d))
shutil.copy2(J('docs', 'publish', 'README.md'), os.path.join(kit, 'README.md'))
for f in ('titles.md', 'descriptions.md', 'publish.json'): shutil.copy2(J('docs', 'publish', f), os.path.join(kit, 'copy', f))
for l in ('zh', 'en'):
    for f in sorted(os.listdir(J('out', 'covers', l))):
        if f.endswith('.jpg'): shutil.copy2(J('out', 'covers', l, f), os.path.join(kit, 'covers', l, f))
for t, n in STILLS: shutil.copy2(still(t), os.path.join(kit, 'stills', n + '.jpg'))
for f in ('TOO_SLOW_4K.mp4', 'TOO_SLOW_1080p.mp4'): shutil.copy2(J('out', 'final', f), os.path.join(kit, 'video', f))

if os.path.exists(zpath): os.remove(zpath)
n = 0
with zipfile.ZipFile(zpath, 'w', allowZip64=True) as z:
    for base, _, files in os.walk(kit):
        for f in sorted(files):
            p = os.path.join(base, f); arc = NAME + '/' + os.path.relpath(p, kit).replace(os.sep, '/')
            z.write(p, arc, compress_type=zipfile.ZIP_DEFLATED if f.endswith(('.md', '.json')) else zipfile.ZIP_STORED); n += 1
with zipfile.ZipFile(zpath) as z:
    bad = z.testzip()
    if bad: sys.exit('zip is damaged at ' + bad)
    for i in z.infolist(): print('%10.1f MB  %s' % (i.file_size / 1048576, i.filename))
print('%d files, %.0f MB -> %s' % (n, os.path.getsize(zpath) / 1048576, zpath))
