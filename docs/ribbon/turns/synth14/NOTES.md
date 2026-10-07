# synth14 progress notes
- [x] read synth13/11/12/8 machinery; twist_primitive.py written
- [ ] solve3d_synth14.py (GT, fit, convert, run, merge)
- [x] solve3d_synth14.py written (gt/prep/run S14|C8/merge). GT check done (face before/window/after = A 0.0/0.98/0.0; ramp 20 not 10 for monotone).
- next: run `prep` (bg, log prep.log), then `run S14`, `run C8`, `merge`
- prep run1: fit poor (best rms_slide 3.9px, phi 117deg), conversion w/o roots gave junk (delta at +-168); patched fallback delta=0, rerunning prep
- prep done (delta=0 fallback; init rms3d 29.9). running S14 and C8 (logs run_S14.log/run_C8.log)
- S14, C8 runs done; running merge
- merge done; gate FAIL for both; final report sent
