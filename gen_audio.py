"""Cinematic 15s sound bed: deep drone, pulses, riser, impacts, resolve."""
import numpy as np, wave

SR = 48000
DUR = 15.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

L = np.zeros(N); R = np.zeros(N)

def add(sig, a, b, gain=1.0, fade_in=0.05, fade_out=0.05, pan=0.0):
    s = int(a * SR); e = min(N, int(b * SR))
    n = e - s
    env = np.ones(n)
    fi = max(1, int(fade_in * SR)); fo = max(1, int(fade_out * SR))
    env[:fi] *= np.linspace(0, 1, fi) ** 2
    env[-fo:] *= np.linspace(1, 0, fo) ** 2
    gl = gain * np.cos((pan + 1) * np.pi / 4); gr = gain * np.sin((pan + 1) * np.pi / 4)
    sg = np.zeros(n); m = min(n, len(sig)); sg[:m] = sig[:m]
    L[s:e] += sg * env * gl
    R[s:e] += sg * env * gr

def tone(freq, a, b, gain, fade_in=0.1, fade_out=0.3, pan=0.0, drift=0.0):
    s = int(a * SR); e = min(N, int(b * SR)); n = e - s
    tt = np.arange(n) / SR
    f = freq * (1 + drift * tt)
    ph = np.cumsum(2 * np.pi * f / SR)
    add(np.sin(ph), a, b, gain, fade_in, fade_out, pan)

# --- deep drone bed (whole ad) ---
tone(55, 0, 15, 0.20, 1.2, 1.5)
tone(82.5, 0, 15, 0.08, 1.5, 1.5, pan=-0.2)
tone(110, 0, 15, 0.05, 2.0, 2.0, pan=0.2)
# airy shimmer
tone(440.3, 0, 15, 0.012, 3.0, 3.0, pan=0.4)
tone(554.4, 0, 15, 0.010, 3.0, 3.0, pan=-0.4)

# --- opening pulse (0.4s) : soft sub thump ---
n = int(0.5 * SR); tt = np.arange(n) / SR
add(np.sin(2*np.pi*60*tt) * np.exp(-tt*9), 0.4, 0.9, 0.5, 0.005, 0.4)

# --- heartbeat pulses 1.2 / 2.0 ---
for p in (1.2, 2.0):
    n = int(0.35*SR); tt = np.arange(n)/SR
    add(np.sin(2*np.pi*70*tt)*np.exp(-tt*11), p, p+0.35, 0.28, 0.005, 0.3)

# --- riser 3.0 -> 5.1 (filtered noise sweep up) ---
n = int(2.1*SR); nz = rng.standard_normal(n)
# simple one-pole lowpass with opening cutoff approximated by cumulative mix
sw = np.linspace(0.02, 0.5, n)
y = np.zeros(n); last = 0.0
for i in range(n):
    last += sw[i] * (nz[i] - last)
    y[i] = last
y /= max(1e-6, np.abs(y).max())
add(y, 3.0, 5.1, 0.16, 0.9, 0.15)

# --- impact at 5.1 (shield engage) ---
n = int(1.2*SR); tt = np.arange(n)/SR
boom = np.sin(2*np.pi*48*tt)*np.exp(-tt*4.5) + 0.5*np.sin(2*np.pi*96*tt)*np.exp(-tt*7)
add(boom, 5.1, 6.3, 0.55, 0.005, 1.0)
# metallic ping
tone(1244, 5.1, 6.0, 0.05, 0.005, 0.9, pan=0.3)
tone(1866, 5.1, 5.8, 0.03, 0.005, 0.7, pan=-0.3)

# --- confirmation chimes 5.6 / 6.0 / 6.4 (soft) ---
for i, f in enumerate((880, 1174.7, 1568)):
    tone(f, 5.6 + i*0.4, 5.6 + i*0.4 + 0.8, 0.045, 0.01, 0.7, pan=0.1*i)

# --- whoosh into dashboard (6.9-7.6) ---
n = int(0.7*SR); nz = rng.standard_normal(n)
k = np.linspace(0.05, 0.6, n); y = np.zeros(n); last=0
for i in range(n):
    last += k[i]*(nz[i]-last); y[i]=last
y /= max(1e-6, np.abs(y).max())
add(y*np.linspace(0,1,n)*np.linspace(1,0.2,n), 6.9, 7.6, 0.20, 0.25, 0.3)

# --- soft UI bed under dashboard (7.5-10.8): warm fifth ---
tone(220, 7.5, 10.8, 0.03, 0.8, 0.8, pan=-0.2)
tone(330, 7.5, 10.8, 0.022, 0.8, 0.8, pan=0.2)

# --- whoosh into finale (10.7-11.5) ---
n = int(0.8*SR); nz = rng.standard_normal(n)
k = np.linspace(0.05, 0.5, n); y = np.zeros(n); last=0
for i in range(n):
    last += k[i]*(nz[i]-last); y[i]=last
y /= max(1e-6, np.abs(y).max())
add(y*np.linspace(0,1,n)*np.linspace(1,0.25,n), 10.7, 11.5, 0.22, 0.3, 0.35)

# --- resolve chord (11.2-14.5): A minor add9-ish, warm ---
for f, g in ((220,.05),(261.6,.035),(329.6,.035),(493.9,.02),(587.3,.015)):
    tone(f, 11.2, 14.6, g, 0.9, 1.6, pan=0.0)
# final soft impact + shimmer at logo lock (11.6)
n = int(0.9*SR); tt=np.arange(n)/SR
add(np.sin(2*np.pi*55*tt)*np.exp(-tt*5), 11.6, 12.5, 0.4, 0.005, 0.8)
tone(1760, 11.6, 13.2, 0.02, 0.02, 1.2, pan=0.2)

# --- master: gentle fade, normalize, soft clip ---
mx = max(np.abs(L).max(), np.abs(R).max())
L /= mx; R /= mx
L *= 0.89; R *= 0.89
L = np.tanh(L * 1.1); R = np.tanh(R * 1.1)

st = np.stack([L, R], axis=1)
pcm = (st * 32767).astype(np.int16)
with wave.open('/home/runner/work/PlayGround/PlayGround/output/bed.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('bed written', pcm.shape, 'peak', float(np.abs(st).max()))
