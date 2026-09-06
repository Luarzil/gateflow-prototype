"""CR-V12: additive, audio-timed video editions using existing V11 captures."""
import asyncio
import hashlib
import html
import json
import math
import re
import subprocess
from pathlib import Path

import edge_tts
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'docs/media'
OUT = MEDIA / 'refresh-v2'
FF = imageio_ffmpeg.get_ffmpeg_exe()
VOICE = 'en-US-JennyNeural'
W, H = 1920, 1080
FONT = Path('C:/Windows/Fonts')
INK, PAPER, GREEN, MUTED = '#152321', '#F4F7F6', '#5BE2A0', '#ABC0B8'

def scene(frame, title, takeaway, narration, chapter, layout='phone'):
    return dict(frame=frame, title=title, takeaway=takeaway, narration=narration, chapter=chapter, layout=layout)

VIDEOS = {
 'customer': [
  scene('c/01-title.png', 'Veri-Gate', 'A clearer record of every movement.', 'Meet Veri Gate. A practical way to record who is driving, which vehicle is moving, and when it passes through the gate. Let\'s follow a typical movement.', 'THE BIG PICTURE'),
  scene('c/04-driver.png', 'Start with\nthe driver.', 'Scan a badge. Confirm the driver.', 'First, scan the driver\'s badge, or enter their employee number. The screen brings up the driver and their authorization status, so the operator has the context they need.', 'AT THE GATE'),
  scene('c/05-vehicle.png', 'Identify\nthe vehicle.', 'One barcode connects the movement.', 'Next, scan the vehicle barcode. For a known vehicle, its details appear on screen. If it is new to inventory, Veri Gate adds a record automatically as the movement is processed.', 'AT THE GATE'),
  scene('c/06-movement.png', 'Choose.\nReview. Record.', 'Driver, vehicle, location and time.', 'Choose in or out, review the movement, and submit. The record includes the driver, vehicle, gate, device, and time. The scanner then returns to the start, ready for the next vehicle.', 'AT THE GATE'),
  scene('c/08-exit.png', 'Keep the\nrecord moving.', 'New vehicles follow the usual driver checks.', 'A newly added vehicle can leave through the normal process. Missing inventory details do not hold it up. The usual driver authorization and license checks still apply.', 'A CONTINUOUS RECORD'),
  scene('c/09-override.png', 'Handle\nexceptions.', 'Temporary approval: Fleet Lead or above.', 'When a driver needs temporary authorization, a Fleet Lead or higher role can approve it. The prototype records that decision, keeping the exception connected to the movement.', 'ACCOUNTABILITY'),
  scene('c/10-console.png', 'The wider view.', 'Drivers, vehicles and devices in one console.', 'The desktop console brings the operational records together. Supervisors can manage drivers, update vehicle details, and review the devices assigned to each location.', 'IN THE OFFICE', 'desktop'),
  scene('c/14-search.png', 'Find the record.', 'Search the history behind a movement.', 'When a question comes up later, search the movement history by driver, vehicle, location, or date. The details captured at the gate are there to review.', 'IN THE OFFICE', 'desktop'),
  scene('c/15-yard.png', 'Ready for\na closer look.', 'Android review build. Local device storage.', 'This review build runs on Android and stores records on the device, including without a signal. Shared cloud data and automatic synchronization are still being developed. For now, it is ready to explore the gate workflow.', 'CURRENT REVIEW BUILD'),
  scene('c/16-close.png', 'Veri-Gate', 'Every movement starts with a clear record.', 'Veri Gate. A focused workflow at the gate, and a clearer record to work from afterward.', 'LET\'S TAKE A LOOK'),
 ],
 'walkthrough': [
  scene('d/01-scanner-home.png', 'A smoother\ngate workflow.', 'Veri-Gate V0.8 / latest review revision', 'Here is the updated Veri Gate walkthrough. We will follow a vehicle through the gate, then look at the inventory and user changes from your latest feedback.', 'PATRICK / REVIEW EDITION'),
  scene('d/02-driver-entry.png', 'Driver first.', 'Scan or enter the employee number.', 'Start with the driver. Scan the badge or enter the employee number, confirm the record, and continue to the vehicle barcode.', '01 / SCAN'),
  scene('d/03-unknown-vehicle.png', 'New barcode?\nKeep going.', 'Inventory is created during the movement.', 'This barcode is not in inventory yet. The workflow accepts it and continues. When the movement is processed, the vehicle is added as ordinary inventory.', '01 / SCAN'),
  scene('d/04-movement-choice.png', 'Choose the\ndirection.', 'IN or OUT, followed by review and submit.', 'Choose the direction, review the details, and submit the movement. After recording it, the scanner returns to the start, ready for the next driver.', '02 / RECORD'),
  scene('d/06-unknown-out.png', 'The exit\nis recorded too.', 'Normal driver and license checks still apply.', 'The same vehicle can leave through the usual driver checks. There is no inventory completion block. A barcode first encountered on exit is also added and logged in this version.', '02 / RECORD'),
  scene('d/08-gate-log.png', 'See what arrived.', 'Vehicles Added By Scan preserves their origin.', 'In the console, Vehicles Added By Scan shows which records originated at the gate. Supervisors can fill in missing details later. Those details do not delay the vehicle\'s next movement.', '03 / REVIEW', 'desktop'),
  scene('d/10-user-edit.png', 'Edit existing\nusers.', 'Update the existing record, without a duplicate.', 'Users now have an Edit action. It opens their existing details, and saving updates that same user. Changes to the user\'s role are recorded in the audit history.', '04 / MANAGE', 'user'),
  scene('d/10-user-edit.png', 'One Admin\nrole.', 'Scanner / Fleet Lead / Supervisor / Admin', 'The separate Manager role has been removed. The available roles are Scanner, Fleet Lead, Supervisor, and Admin. Existing Manager user records convert to Admin. These are still prototype accounts; secure login is part of the backend work.', '04 / MANAGE', 'user'),
  scene('d/11-override-role.png', 'Approval has\na clear threshold.', 'Fleet Lead or above for temporary authorization.', 'For a driver authorization override, the approver must be a Fleet Lead or above. A Scanner role cannot approve it. The driver checks remain in place alongside the new inventory behavior.', '05 / AUTHORIZE'),
  scene('d/12-search.png', 'Review the history.', 'The movement remains available to search.', 'Finally, the movement stays in the searchable history. The Android package includes these same revisions. This remains a device-local review build, with shared data and synchronization still ahead.', '06 / FOLLOW THROUGH', 'desktop'),
 ]
}

def run(args):
    p = subprocess.run([FF, '-hide_banner', *map(str, args)], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr[-3500:])
    return p.stderr

def font(size, bold=False):
    return ImageFont.truetype(str(FONT / ('segoeuib.ttf' if bold else 'segoeui.ttf')), size)

def wrapped(draw, text, pos, size, width, fill, bold=False):
    y = pos[1]
    for paragraph in text.split('\n'):
        line = ''
        for word in paragraph.split():
            test = (line + ' ' + word).strip()
            if draw.textlength(test, font=font(size, bold)) > width and line:
                draw.text((pos[0], y), line, font=font(size, bold), fill=fill)
                y += int(size * 1.18)
                line = word
            else:
                line = test
        draw.text((pos[0], y), line, font=font(size, bold), fill=fill)
        y += int(size * 1.18)
    return y

def source_path(item):
    prefix, name = item['frame'].split('/')
    return MEDIA / ('verigate-customer-frames' if prefix == 'c' else 'verigate-v08-demo-frames') / name

def frame(item, index, total):
    desktop = item['layout'] == 'desktop'
    bg, fg, subtle = (PAPER, INK, '#587169') if desktop else (INK, PAPER, MUTED)
    im = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(im)
    d.rectangle((76, 63, 86, 96), fill='#16A365')
    d.text((103, 54), 'Veri-Gate', font=font(32, True), fill=fg)
    d.text((1370, 67), 'V0.8   /   PRODUCT REVIEW', font=font(20), fill=subtle)
    shot = Image.open(source_path(item)).convert('RGB')
    if desktop:
        d.text((78, 139), item['chapter'], font=font(22, True), fill='#087747')
        wrapped(d, item['title'], (76, 175), 56, 1700, fg, True)
        shot.thumbnail((1620, 650), Image.Resampling.LANCZOS)
        x, y = (W - shot.width) // 2, 285
        d.rectangle((x-2, y-2, x+shot.width+2, y+shot.height+2), fill='#C4D5CC')
        im.paste(shot, (x,y))
    else:
        if item['layout'] == 'user':
            shot = shot.crop((468, 16, 900, 883))
        d.text((95, 232), item['chapter'], font=font(23, True), fill=GREEN)
        bottom = wrapped(d, item['title'], (89, 300), 100, 1010, PAPER, True)
        d.line((96, bottom+34, 206, bottom+34), fill=GREEN, width=5)
        wrapped(d, item['takeaway'], (94, bottom+67), 33, 880, MUTED)
        shot.thumbnail((535, 795), Image.Resampling.LANCZOS)
        x, y = 1350-shot.width//2, 153
        d.rounded_rectangle((x-14,y-14,x+shot.width+14,y+shot.height+14), radius=30, fill='#394E47')
        im.paste(shot,(x,y))
    d.line((78, 991, 1842, 991), fill='#CBD8D1' if desktop else '#3B4F48', width=2)
    d.line((78, 991, 78+int(1764*(index+1)/total), 991), fill='#16A365' if desktop else GREEN, width=4)
    d.text((78, 1010), item['takeaway'] if desktop else 'VERI-GATE  /  GATE OPERATIONS', font=font(23), fill=subtle)
    d.text((1720,1010), f'{index+1:02d} / {total:02d}', font=font(23), fill=subtle)
    return im

def stamp(seconds):
    ms = round(seconds * 1000)
    h, ms = divmod(ms,3600000)
    m, ms = divmod(ms,60000)
    s, ms = divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'

async def speech(item, target):
    meta = target.with_suffix('.json')
    identity = dict(text=item['narration'], voice=VOICE, rate='-3%')
    if target.exists() and meta.exists():
        saved = json.loads(meta.read_text())
        if saved['identity'] == identity:
            return saved['boundaries']
    boundaries = []
    communicate = edge_tts.Communicate(item['narration'], VOICE, rate='-3%', boundary='SentenceBoundary')
    with target.open('wb') as out:
        async for chunk in communicate.stream():
            if chunk['type'] == 'audio':
                out.write(chunk['data'])
            elif chunk['type'] == 'SentenceBoundary':
                boundaries.append(dict(start=chunk['offset']/1e7, duration=chunk['duration']/1e7, text=chunk['text']))
    meta.write_text(json.dumps(dict(identity=identity,boundaries=boundaries),indent=2))
    return boundaries

def duration(filename):
    result = subprocess.run([FF,'-hide_banner','-i',str(filename)],capture_output=True,text=True)
    match = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',result.stderr)
    if not match:
        raise RuntimeError(result.stderr)
    return sum(float(v)*m for v,m in zip(match.groups(),[3600,60,1]))

async def build(name, scenes):
    work = OUT/name
    work.mkdir(parents=True, exist_ok=True)
    parts, subtitles, timeline = [], [], []
    elapsed = 0
    for i, item in enumerate(scenes):
        base = work/f'{i+1:02d}'
        png, mp3, clip = base.with_suffix('.png'), base.with_suffix('.mp3'), base.with_suffix('.mp4')
        frame(item,i,len(scenes)).save(png)
        boundaries = await speech(item,mp3)
        length = math.ceil((duration(mp3)+0.65)*24)/24
        for b in boundaries:
            subtitles.append(f'{len(subtitles)+1}\n{stamp(elapsed+.18+b["start"])} --> {stamp(elapsed+.18+b["start"]+b["duration"])}\n{b["text"]}\n')
        frames = round(length*24)
        # A small, smooth push keeps the product legible; each cut follows its narration.
        motion = f"zoompan=z='1+0.012*on/{frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={frames}:s=1920x1080:fps=24"
        if i == 0:
            motion += ',fade=t=in:st=0:d=0.25'
        if i == len(scenes)-1:
            motion += f',fade=t=out:st={length-.3}:d=0.3'
        run(['-y','-i',png,'-i',mp3,'-vf',motion,'-af','adelay=180:all=1,apad,loudnorm=I=-16:TP=-1.5:LRA=9',
             '-t',length,'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-threads','4',
             '-c:a','aac','-ar','48000','-ac','2','-b:a','160k','-movflags','+faststart',clip])
        parts.append(f"file '{clip.name}'")
        timeline.append(dict(start=round(elapsed,3),duration=length,**item))
        elapsed += length
        print(f'{name} {i+1}/{len(scenes)}: {length:.1f}s',flush=True)
    manifest = work/'concat.txt'
    manifest.write_text('\n'.join(parts))
    output = OUT/f'verigate-{name}-v2.mp4'
    run(['-y','-f','concat','-safe','0','-i',manifest,'-c','copy','-movflags','+faststart',output])
    output.with_suffix('.srt').write_text('\n'.join(subtitles),encoding='utf-8')
    output.with_suffix('.vtt').write_text('WEBVTT\n\n'+re.sub(r'(\d\d:\d\d:\d\d),(\d{3})',r'\1.\2','\n'.join(subtitles)),encoding='utf-8')
    output.with_suffix('.json').write_text(json.dumps(dict(voice=VOICE,duration=elapsed,scenes=timeline),indent=2))
    (OUT/f'{name}-script.md').write_text('\n\n'.join(f'## {s["title"].replace(chr(10)," ")}\n\n{s["narration"]}' for s in scenes))
    thumbs = Image.new('RGB',(960,math.ceil(len(scenes)/2)*270),PAPER)
    for i in range(len(scenes)):
        thumbs.paste(Image.open(work/f'{i+1:02d}.png').resize((480,270)),((i%2)*480,(i//2)*270))
    thumbs.save(OUT/f'{name}-contact.jpg')
    run(['-v','error','-i',output,'-f','null','-'])
    return dict(file=output.name,seconds=round(elapsed,2),bytes=output.stat().st_size,decoded=True)

async def main():
    OUT.mkdir(parents=True,exist_ok=True)
    originals = [MEDIA/'verigate-customer.webm',MEDIA/'verigate-v08-demo.webm']
    before = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in originals}
    reports=[]
    for name, scenes in VIDEOS.items():
        reports.append(await build(name,scenes))
    assert before == {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in originals}
    (OUT/'verification.json').write_text(json.dumps(dict(originals=before,voice=VOICE,reports=reports),indent=2))
    print(json.dumps(reports),flush=True)

if __name__ == '__main__':
    asyncio.run(main())
