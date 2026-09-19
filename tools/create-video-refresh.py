"""Audio-timed Jenny video editions using asserted current-workflow captures."""
import asyncio
import hashlib
import html
import json
import math
import re
import subprocess
import sys
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
  scene("c/01-title.png", "Veri-Gate", "A clear record of each gate movement.", "Meet Veri Gate. Record which vehicle is moving, who is driving, and when it passes through the gate. Here is the current review workflow.", "CAVALRY / PRODUCT REVIEW"),
  scene("c/04-vehicle.png", "Start with the vehicle.", "Scan the vehicle barcode first.", "Start by scanning the vehicle barcode. The field opens scan ready, with keyboard input suppressed. When typing is needed, tap the field. The tap marks that entry as manual.", "AT THE GATE"),
  scene("c/05-driver.png", "Then the driver.", "Scan or enter the employee number.", "Next, scan the driver employee number. Confirm the driver before choosing the movement direction.", "AT THE GATE"),
  scene("c/alphanumeric-driver.png", "Flexible employee IDs.", "Letters are supported alongside numeric IDs.", "Employee numbers can include letters, as this demonstration record shows. Numeric forms such as one zero zero three and E M P dash one zero zero three still resolve to E one zero zero three.", "AT THE GATE"),
  scene("c/06-movement.png", "Choose IN or OUT.", "Direction comes after vehicle and driver.", "Choose whether the vehicle is entering or leaving. Then continue to the review screen.", "AT THE GATE"),
  scene("c/review.png", "Review, then submit.", "Vehicle, driver, direction, gate and time.", "Choose the direction, then review the movement before submitting. The scanner returns to the start after recording it.", "AT THE GATE"),
  scene("c/07-unknown.png", "A new scanned vehicle.", "Continues without a barcode warning or review flag.", "An unknown scanned barcode continues without a barcode warning. Its vehicle record is created when the movement is submitted, without a Check barcode flag. Normal driver checks still apply.", "SCANNED ENTRY"),
  scene("c/typed-partial.png", "Complete the barcode.", "G00 is incomplete. Enter all four digits.", "When typing is needed, tap the barcode field. That tap enables typing and records manual entry. A partial barcode such as G zero zero is refused. Enter all four digits.", "TYPED ENTRY"),
  scene("c/typed-unknown.png", "Check a typed barcode.", "A complete unknown barcode can continue.", "A complete typed barcode that is not in inventory warns: Check this barcode. Continue if it is right. The movement can proceed, and the vehicle is marked Check barcode for supervisor review.", "TYPED ENTRY"),
  scene("c/flagged-vehicle.png", "A supervisor can review.", "Typed unknown vehicles show Check barcode.", "In the console, the vehicle created from the typed unknown barcode is marked Check barcode, making it visible for supervisor review.", "IN THE OFFICE", "desktop"),
  scene("c/09-override.png", "Controlled exceptions.", "Fleet Lead or above can approve.", "For a driver who needs temporary authorization, approval requires a Fleet Lead or higher role. Here, an approver with the Scanner role is refused.", "AUTHORIZATION"),
  scene("c/durations.png", "Select the duration.", "Nine hours is the default.", "Choose nine hours, twelve hours, today, forty eight hours, or three days. Nine hours is the default selection.", "AUTHORIZATION"),
  scene("c/10-console.png", "The Supervisor Console.", "Vehicle inventory and operational records.", "The desktop console brings vehicle inventory and operational records together for supervisors.", "IN THE OFFICE", "desktop"),
  scene("c/vin-only.png", "Start with a VIN.", "A blank barcode is assigned automatically.", "To add a vehicle, enter its V I N. Other details can be completed later. Leave the barcode blank to assign the next free G barcode automatically.", "IN THE OFFICE", "desktop"),
  scene("c/auto-barcode.png", "Saved to inventory.", "The VIN and assigned barcode appear together.", "The saved vehicle now appears in inventory with its automatically assigned barcode. Select its V I N to open the record.", "IN THE OFFICE", "desktop"),
  scene("c/user-identifiers.png", "Open the right record.", "Select a User ID or name.", "User records open from their User I D or name, keeping the record directly accessible from the list.", "IN THE OFFICE", "desktop"),
  scene("c/13-devices.png", "Devices and locations.", "Select a Device ID to open its record.", "Select a Device I D to open that device. Supervisors can review the location and device details associated with gate operations.", "IN THE OFFICE", "desktop"),
  scene("c/14-search.png", "Find the movement.", "Search the recorded history.", "Search movement history by driver, vehicle, location, or date. The information captured at the gate remains available to review.", "IN THE OFFICE", "desktop"),
  scene("c/16-close.png", "Veri-Gate", "Device-local Android review build.", "This Android review build stores records on the device. Shared cloud data and automatic synchronization are still being developed. Veri Gate brings a focused workflow to the gate and a clearer record afterward.", "CURRENT REVIEW BUILD"),
 ],
 'walkthrough': [
  scene("d/01-scanner-home.png", "The updated workflow.", "CR-V13, CR-V14 and CR-V15.", "Patrick, this walkthrough shows the current vehicle first workflow and the latest barcode integrity changes. We will also check the console updates and record controls.", "PATRICK / REVIEW"),
  scene("d/02-vehicle-entry.png", "Vehicle first.", "Scan-ready. Tap the field only to type.", "Step one is the vehicle barcode. The field opens in scan mode, with keyboard input suppressed. Tapping the field enables typing and marks the entry as manual. There is no separate manual entry button.", "01 / VEHICLE"),
  scene("d/03-driver-entry.png", "Driver second.", "Then direction, review and submit.", "Step two is the driver employee number. This field also opens scan ready. After the driver, choose the direction, then review and submit.", "02 / DRIVER"),
  scene("d/alphanumeric-driver.png", "Letters are supported.", "AB123 stays AB123. Numeric IDs fold to E1003.", "Employee numbers can contain letters. Here, A B one two three identifies our demonstration driver. Numeric forms one zero zero three, E one zero zero three, and E M P dash one zero zero three all resolve to E one zero zero three.", "02 / DRIVER"),
  scene("d/04-movement-choice.png", "Choose the direction.", "Vehicle IN or Vehicle OUT.", "With the vehicle and driver captured, choose Vehicle In or Vehicle Out. The next screen is the review step.", "03 / DIRECTION"),
  scene("d/review.png", "Review, then submit.", "Vehicle, driver, direction, gate and time.", "Choose the direction, then review the movement before submitting. The scanner returns to the start after recording it.", "AT THE GATE"),
  scene("d/03-unknown-vehicle.png", "Unknown, scanned.", "No barcode warning. No Check barcode flag.", "This unknown barcode arrived through the scanner input path. It advances without the typed barcode warning. When submitted, its vehicle record is created without a Check barcode flag. Normal driver checks still apply.", "SCANNED ENTRY"),
  scene("d/typed-partial.png", "Complete the barcode.", "G00 is incomplete. Enter all four digits.", "When typing is needed, tap the barcode field. That tap enables typing and records manual entry. A partial barcode such as G zero zero is refused. Enter all four digits.", "TYPED ENTRY"),
  scene("d/typed-unknown.png", "Check a typed barcode.", "A complete unknown barcode can continue.", "A complete typed barcode that is not in inventory warns: Check this barcode. Continue if it is right. The movement can proceed, and the vehicle is marked Check barcode for supervisor review.", "TYPED ENTRY"),
  scene("d/flagged-vehicle.png", "Visible for review.", "G9002 was typed. Its record says Check barcode.", "Here is the vehicle created from the typed unknown barcode. Check barcode is visible on its record. The unknown scanned vehicle was verified without that flag. That distinction is deliberate.", "SUPERVISOR REVIEW", "desktop"),
  scene("d/06-unknown-out.png", "Review the exit.", "Inventory details do not block the movement.", "The scanned vehicle can leave through the normal driver and license checks. This is the exit review screen, before submission. Missing inventory details do not block the movement.", "MOVEMENT HISTORY"),
  scene("d/11-override-role.png", "Role refusal verified.", "Scanner cannot approve. Fleet Lead or above is required.", "This is the actual role refusal. Casey Rowe holds the Scanner role and cannot approve the override. This driver has a current license but lacks authorization, so we are showing a role refusal, not an expired license screen.", "AUTHORIZATION"),
  scene("d/durations.png", "Choose the duration.", "9 Hours / 12 Hours / Today / 48 Hours / 3 Days", "Authorization is selectable. The choices are nine hours, twelve hours, today, forty eight hours, and three days. Nine hours is the default, not a fixed duration.", "AUTHORIZATION"),
  scene("d/07-console-shell.png", "Supervisor Console.", "Vehicle inventory in the desktop console.", "This is the desktop supervisor console, showing vehicle inventory. Records open through their identifiers instead of separate per row Edit buttons.", "RECORD MANAGEMENT", "desktop"),
  scene("d/vehicle-record.png", "Open the vehicle record.", "VIN opens the record. Removal stays with the vehicle.", "A vehicle opens from its V I N, or Add V I N when missing. The removal control is available in the vehicle record, so supervisors can remove a vehicle from active inventory without deleting its history.", "RECORD MANAGEMENT", "desktop"),
  scene("d/vin-only.png", "Add with only a VIN.", "Leave the optional barcode blank.", "Adding a vehicle requires only its V I N. Leave the optional barcode blank and save. The application assigns the next free G barcode.", "VEHICLE INVENTORY", "desktop"),
  scene("d/auto-barcode.png", "Barcode assigned.", "The next free barcode is G0006 in this demo.", "The vehicle has been saved. Here the next free barcode was G zero zero zero six, and the inventory shows it beside the V I N we entered.", "VEHICLE INVENTORY", "desktop"),
  scene("d/user-identifiers.png", "Open by user identity.", "User ID or name opens the existing record.", "In the user list, select the User I D or name to open that existing user. The old per row Edit and Remove controls are gone.", "USERS", "desktop"),
  scene("d/10-user-edit.png", "Edit the existing user.", "Scanner / Fleet Lead / Supervisor / Admin", "This is the existing user record. The available roles are Scanner, Fleet Lead, Supervisor, and Admin. These are prototype accounts, with the limitations shown in the form.", "USERS", "desktop"),
  scene("d/device-identifiers.png", "Open by Device ID.", "Select the identifier to inspect the device.", "Device records open from Device I D. The list retains operational status and history controls.", "DEVICES", "desktop"),
  scene("d/device-record.png", "Device record.", "Location and device details together.", "The selected device opens here, with its location and configuration details.", "DEVICES", "desktop"),
  scene("d/12-search.png", "Review the history.", "Searchable movements. Device-local review build.", "Movement history remains searchable. This is a device local review build. Shared cloud data and synchronization remain future work. The videos are ready for review, with deployment handled separately.", "FOLLOW THROUGH", "desktop"),
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
    if '--render-only' in sys.argv:
        for name, scenes in VIDEOS.items():
            work = OUT/name
            work.mkdir(parents=True, exist_ok=True)
            thumbs = Image.new('RGB', (960, math.ceil(len(scenes)/2)*270), PAPER)
            for i, item in enumerate(scenes):
                rendered = frame(item, i, len(scenes))
                rendered.save(work/f'{i+1:02d}.png')
                thumbs.paste(rendered.resize((480,270)), ((i%2)*480,(i//2)*270))
            thumbs.save(OUT/f'{name}-contact.jpg')
        return
    originals = [MEDIA/'verigate-customer.webm',MEDIA/'verigate-v08-demo.webm']
    before = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in originals}
    reports=[]
    for name, scenes in VIDEOS.items():
        if '--verify-only' in sys.argv:
            output = OUT/f'verigate-{name}-v2.mp4'
            timeline = json.loads(output.with_suffix('.json').read_text())
            assert len(timeline['scenes']) == len(scenes)
            run(['-v','error','-i',output,'-f','null','-'])
            reports.append(dict(file=output.name,seconds=round(timeline['duration'],2),bytes=output.stat().st_size,decoded=True))
        else:
            reports.append(await build(name,scenes))
    assert before == {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in originals}
    (OUT/'verification.json').write_text(json.dumps(dict(originals=before,voice=VOICE,reports=reports),indent=2))
    print(json.dumps(reports),flush=True)

if __name__ == '__main__':
    asyncio.run(main())
