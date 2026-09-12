"""Decode each scene and check its picture and subtitle timing against the build."""
import importlib.util
import io
import json
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

spec = importlib.util.spec_from_file_location('video', Path(__file__).with_name('create-video-refresh.py'))
video = importlib.util.module_from_spec(spec)
spec.loader.exec_module(video)


def seconds(stamp):
    h, m, s = stamp.split(':')
    return int(h)*3600 + int(m)*60 + float(s)


reports = []
for name, expected in video.VIDEOS.items():
    path = video.OUT/f'verigate-{name}-v2.mp4'
    timeline = json.loads(path.with_suffix('.json').read_text())
    assert timeline['voice'] == 'en-US-JennyNeural'
    assert len(timeline['scenes']) == len(expected)
    cues = re.findall(r'(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})\n([^\n]+)', path.with_suffix('.vtt').read_text(encoding='utf-8'))
    contact = Image.new('RGB', (960, ((len(expected)+1)//2)*270), video.PAPER)
    checked = []
    for i, (scene, item) in enumerate(zip(timeline['scenes'], expected)):
        assert all(scene[key] == value for key, value in item.items()), (name, i, 'stale timeline')
        midpoint = scene['start'] + scene['duration']/2
        result = subprocess.run([video.FF, '-v', 'error', '-ss', str(midpoint), '-i', str(path),
                                 '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-threads', '1', '-'],
                                capture_output=True, check=True)
        decoded = Image.open(io.BytesIO(result.stdout)).convert('RGB')
        reference = Image.open(video.OUT/name/f'{i+1:02d}.png').convert('RGB')
        assert decoded.size == reference.size == (1920, 1080)
        # Allow the intentional 1.2% camera push and compression, not a different scene.
        delta = sum(ImageStat.Stat(ImageChops.difference(decoded.resize((160,90)), reference.resize((160,90)))).mean)/3
        assert delta < 12, (name, i+1, 'picture mismatch', delta)
        scene_cues = [(seconds(a), seconds(b), text) for a,b,text in cues
                      if scene['start'] <= seconds(a) < scene['start'] + scene['duration']]
        assert scene_cues, (name, i+1, 'missing captions')
        assert all(a < b <= scene['start'] + scene['duration'] + .05 for a,b,_ in scene_cues), (name, i+1, 'caption crosses cut')
        spoken = ' '.join(text for _,_,text in scene_cues)
        normalize = lambda text: re.sub(r'[^a-z0-9]', '', video.html.unescape(text).lower())
        assert normalize(spoken) == normalize(item['narration']), (name, i+1, 'narration mismatch')
        contact.paste(decoded.resize((480,270)), ((i%2)*480,(i//2)*270))
        checked.append(dict(scene=i+1, title=item['title'], midpoint=round(midpoint,3), pictureDelta=round(delta,3), captionsMatch=True))
    contact.save(video.OUT/f'{name}-decoded-contact.jpg')
    reports.append(dict(video=name, scenes=checked, seconds=timeline['duration']))
(video.OUT/'scene-verification.json').write_text(json.dumps(reports, indent=2))
print(json.dumps([dict(video=r['video'], scenes=len(r['scenes']), seconds=round(r['seconds'],2), allPassed=True) for r in reports]))
