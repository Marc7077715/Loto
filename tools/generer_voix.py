import subprocess, os, sys, wave
from piper import PiperVoice
OUT = sys.argv[1]
voice = PiperVoice.load("voice/fr_FR-siwis-medium.onnx")
U = ["zéro","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize","dix-sept","dix-huit","dix-neuf"]
T = {20:"vingt",30:"trente",40:"quarante",50:"cinquante",60:"soixante"}
def mot(n):
    if n < 20: return U[n]
    if n < 70:
        d, u = n//10*10, n%10
        return T[d] if u == 0 else (T[d]+" et un" if u == 1 else T[d]+"-"+U[u])
    if n < 80: return "soixante et onze" if n == 71 else "soixante-"+U[n-60]
    if n == 80: return "quatre-vingts"
    return "quatre-vingt-"+U[n-80]
clips = {}
for n in range(1, 91):
    clips[f"n/{n}"] = ("Le " + mot(n) + "." if n < 10 else mot(n).capitalize() + ".")
    if n >= 10: clips[f"d/{n}"] = f"{U[n//10].capitalize()}, {U[n%10]}."
for l, t in {"B":"Bé.","I":"I.","N":"Enne.","G":"Gé.","O":"Eau."}.items(): clips[f"l/{l}"] = t
clips.update({
 "p/quine":"Quine !", "p/double-quine":"Double quine !", "p/carton-plein":"Carton plein !",
 "p/bingo":"Bingo !", "p/ligne":"Ligne !", "p/debut":"Attention, la partie commence. Bonne chance à tous !",
 "p/fin":"Tous les numéros sont sortis. La partie est terminée.",
 "p/cadeau":"Et le cadeau surprise est attribué à…", "p/bravo":"Félicitations !",
 "p/demarque":"On démarque. Nouvelle partie !", "p/verif":"Un instant, nous vérifions le carton.",
})
for k, t in clips.items():
    wav = f"tmp/{k.replace('/','_')}.wav"; os.makedirs("tmp", exist_ok=True)
    with wave.open(wav, "wb") as w: voice.synthesize_wav(t, w)
    dst = f"{OUT}/{k}.mp3"; os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(["ffmpeg","-y","-loglevel","error","-i",wav,"-af","silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5,apad=pad_dur=0.12","-ar","44100","-ac","1","-b:a","64k",dst],check=True)
print(len(clips))
