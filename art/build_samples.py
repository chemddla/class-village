# 캐릭터 디자인 시안 6종 (따뜻한 생활 게임 화풍: 약 2.5등신, 흰자 있는 큰 눈, 결 있는 머리)
# 실행: python tools/blender_run.py art/build_samples.py  (Blender가 열려 있어야 함)
# 결과: art/cards/<시안>_front.png, _back.png  → python art/make_sheet.py 로 한 장에 모음
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Color, Matrix, Vector

OUT = Path(__file__).resolve().parent
CARDS = OUT / "cards"
CARDS.mkdir(exist_ok=True)
PREFIX = "CV_"
SKIN = "#ffd2b0"

# ───────────── 시안 정의 ─────────────
# hair: short(옆으로 넘긴 짧은 머리) / bob(일자 앞머리 단발) / pony(포니테일) / twin(양갈래)
# bottom: shorts(반바지) / skirt(치마)
CHARS = [
    dict(key="A", hair="short", hair_col="#b8652f", top="#fff1d2", bottom="shorts", bottom_col="#8e3b3b",
         shoes="#3d6fd6", iris="#6b4a33"),
    dict(key="B", hair="bob", hair_col="#e3b45e", top="#e8524f", bottom="skirt", bottom_col="#fff1d2",
         shoes="#d94040", iris="#3f6fc9", lash=True),
    dict(key="C", hair="pony", hair_col="#4a3226", top="#9fd3f2", bottom="skirt", bottom_col="#f6a8bd",
         shoes="#ffffff", iris="#5a3b2a", lash=True),
    dict(key="D", hair="short", hair_col="#3e302a", top="#b7e39c", bottom="shorts", bottom_col="#6f7fb4",
         shoes="#f28b3c", iris="#4b3a30", hat="#ff8f7a"),
    dict(key="E", hair="twin", hair_col="#8a5634", top="#ffd88a", bottom="skirt", bottom_col="#a68bd6",
         shoes="#8a5634", iris="#4f8a4a", lash=True),
    dict(key="F", hair="short", hair_col="#e0a35e", top="#cfb6f2", bottom="shorts", bottom_col="#7f93cc",
         shoes="#ffffff", iris="#3f6fc9", flip=True),
]
GAP = 5.0


def clean():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights, bpy.data.cameras):
        for d in list(coll):
            if d.users == 0 or d.name.startswith(PREFIX):
                coll.remove(d)


# ───────────── 재질: 부드러운 명암 + 은은한 가장자리 빛 ─────────────
def lin(hexcol):
    h = hexcol.lstrip("#")
    c = Color(tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))).from_srgb_to_scene_linear()
    return (c.r, c.g, c.b, 1.0)


_mats = {}


def toon(hexcol, emit=False, rim=0.16):
    key = (hexcol, emit, rim)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(f"{PREFIX}{hexcol}{'_e' if emit else ''}")
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    N.clear()
    out = N.new("ShaderNodeOutputMaterial")
    em = N.new("ShaderNodeEmission")
    L.new(em.outputs[0], out.inputs["Surface"])
    base = lin(hexcol)
    if emit:
        em.inputs["Color"].default_value = base
    else:
        dif = N.new("ShaderNodeBsdfDiffuse")
        s2r = N.new("ShaderNodeShaderToRGB")
        ramp = N.new("ShaderNodeValToRGB")
        L.new(dif.outputs[0], s2r.inputs[0])
        L.new(s2r.outputs["Color"], ramp.inputs["Fac"])
        cr = ramp.color_ramp
        cr.interpolation = "EASE"
        shade = (base[0] * 0.78, base[1] * 0.70, base[2] * 0.84, 1.0)  # 붉은 기 도는 따뜻한 그림자
        cr.elements[0].position = 0.3
        cr.elements[0].color = shade
        cr.elements[1].position = 0.85
        cr.elements[1].color = base
        lw = N.new("ShaderNodeLayerWeight")
        lw.inputs["Blend"].default_value = 0.35
        rr = N.new("ShaderNodeValToRGB")
        rr.color_ramp.elements[0].position = 0.55
        rr.color_ramp.elements[0].color = (0, 0, 0, 1)
        rr.color_ramp.elements[1].position = 1.0
        rr.color_ramp.elements[1].color = (rim, rim * 0.95, rim * 0.85, 1)
        L.new(lw.outputs["Facing"], rr.inputs["Fac"])
        add_ = N.new("ShaderNodeMixRGB")
        add_.blend_type = "ADD"
        add_.inputs["Fac"].default_value = 1.0
        L.new(ramp.outputs["Color"], add_.inputs["Color1"])
        L.new(rr.outputs["Color"], add_.inputs["Color2"])
        L.new(add_.outputs["Color"], em.inputs["Color"])
    _mats[key] = m
    return m


# ───────────── 도형 도우미 ─────────────
def sphere_bm(r, loc=(0, 0, 0), scale=(1, 1, 1), segs=32, rings=20):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((*scale, 1.0)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm


def tube_bm(r1, r2, depth, loc=(0, 0, 0), segs=24):
    """뚜껑 없는 원통 (치마 등)"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm


def rcyl(r1, r2, depth, loc=(0, 0, 0), bevel=0.02, segs=32, sy=1.0, top=True, bottom=True):
    """모서리를 둥글린 원통 (풍선처럼 부풀지 않게). r1=아래 반지름, r2=위 반지름"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
    h = depth / 2
    edges = []
    for e in bm.edges:
        zs = [v.co.z for v in e.verts]
        if (top and all(abs(z - h) < 1e-5 for z in zs)) or (bottom and all(abs(z + h) < 1e-5 for z in zs)):
            edges.append(e)
    if edges and bevel > 0:
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type="OFFSET", profile_type="SUPERELLIPSE",
                        segments=4, profile=0.5, affect="EDGES")
    if sy != 1.0:
        bmesh.ops.scale(bm, vec=Vector((1, sy, 1)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm


def add(name, bm, hexcol, parent, subsurf=0, emit=False, solid=0.0, rim=0.16):
    me = bpy.data.meshes.new(PREFIX + name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(PREFIX + name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(toon(hexcol, emit, rim))
    if subsurf:
        mod = ob.modifiers.new("둥글게", "SUBSURF")
        mod.levels = mod.render_levels = subsurf
    if solid:
        mod = ob.modifiers.new("두께", "SOLIDIFY")
        mod.thickness = solid
        mod.offset = -1
    ob.parent = parent
    return ob


HEAD_SCALE = (1.06, 0.96, 1.0)  # 옆으로 살짝 넓은 머리 (참고 비율)


def on_face(r, hz, x, z, out=0.0):
    """머리 앞면(-Y) 위의 점"""
    sx, sy, sz = HEAD_SCALE
    nx = x / (r * sx)
    nz = (z - hz) / (r * sz)
    k = max(0.0, 1 - nx * nx - nz * nz)
    return Vector((x, -(r * sy) * math.sqrt(k) - out, z))


def smile(r, hz, hs, parent):
    """얇게 웃는 입 (곡선)"""
    cu = bpy.data.curves.new(PREFIX + "입", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.0075 * hs
    cu.bevel_resolution = 3
    sp = cu.splines.new("POLY")
    pts = []
    for i in range(13):
        t = -1 + 2 * i / 12
        x = 0.075 * hs * t
        z = hz - 0.165 * hs - 0.03 * hs * (1 - t * t)
        pts.append(on_face(r, hz, x, z, out=0.004))
    sp.points.add(len(pts) - 1)
    for p, v in zip(sp.points, pts):
        p.co = (v.x, v.y, v.z, 1)
    ob = bpy.data.objects.new(PREFIX + "입", cu)
    ob.data.materials.append(toon("#3a2620", emit=True))
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent


# ───────────── 머리카락 (결이 있는 두툼한 머리) ─────────────
def hair_cap(r, hz, hs, spec, parent):
    style = spec["hair"]
    col = spec["hair_col"]
    hat = bool(spec.get("hat"))
    flip = -1 if spec.get("flip") else 1
    sx, sy, sz = HEAD_SCALE
    R = r * 1.1
    bm = sphere_bm(R, (0, 0, 0), (sx * 1.03, sy, sz), segs=96, rings=48)
    if style == "bob":
        front, side, back = 0.32, -0.62, -0.62
    elif style == "pony" or style == "twin":
        front, side, back = 0.3, 0.05, -0.2
    else:  # short
        front, side, back = 0.38, 0.12, -0.3
    kill = []
    for v in bm.verts:
        n = Vector((v.co.x / (R * sx * 1.03), v.co.y / (R * sy), v.co.z / (R * sz)))
        ang = math.atan2(n.x, -n.y)  # 정면이 0
        a = abs(ang)
        if a < 1.0:  # 앞머리
            if style == "bob":
                limit = front  # 일자 앞머리
            else:
                limit = front + 0.14 * flip * n.x + 0.05 * math.cos(ang * 7)  # 옆으로 넘긴 앞머리
        elif a < 1.9:  # 옆머리 (귀 쪽)
            limit = side
        else:
            limit = back
        if n.z < limit:
            kill.append(v)
        else:
            # 세로 결: 위쪽일수록 약하게 굴곡
            g = 0.02 * math.sin(ang * 34) * (1 - max(0.0, n.z) ** 2)
            v.co *= 1 + g
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    bmesh.ops.translate(bm, vec=Vector((0, 0, hz)), verts=bm.verts)
    add("머리카락", bm, col, parent, subsurf=1, solid=0.05)

    if style == "pony":
        add("묶음", sphere_bm(0.07 * hs, (0, R * 0.92, hz + R * 0.35)), col, parent)
        tail = sphere_bm(0.12 * hs, (0, R * 1.08, hz - R * 0.05), (0.8, 0.7, 1.7))
        add("꽁지", tail, col, parent)
    if style == "twin":
        for s in (-1, 1):
            add("묶음", sphere_bm(0.06 * hs, (s * R * 0.82, R * 0.35, hz + R * 0.1)), "#ff8fa3", parent)
            add("꽁지", sphere_bm(0.11 * hs, (s * R * 0.95, R * 0.45, hz - R * 0.28), (0.8, 0.8, 1.6)),
                col, parent)
    if hat:
        H = R * 1.06
        bm = sphere_bm(H, (0, 0, 0), (sx * 1.03, sy, sz), segs=64, rings=32)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < H * 0.3], context="VERTS")
        bmesh.ops.translate(bm, vec=Vector((0, 0, hz)), verts=bm.verts)
        add("모자", bm, spec["hat"], parent, solid=0.05)
        rim = tube_bm(H * 0.99, H * 0.95, 0.11, (0, 0, hz + H * 0.33), segs=64)
        bmesh.ops.transform(rim, matrix=Matrix.Diagonal((sx * 1.03, sy, 1, 1)), verts=rim.verts)
        ob = add("모자테", rim, "#fff4e6", parent, solid=0.03)
        add("방울", sphere_bm(0.09 * hs, (0, 0, hz + H * 1.0)), "#fff4e6", parent)


# ───────────── 캐릭터 한 명 ─────────────
def build_char(spec, x):
    """참고 비율: 머리(머리카락 포함) ≈ 키의 48%, 몸통 ≈ 25%, 다리+신발 ≈ 27%"""
    root = bpy.data.objects.new(f"{PREFIX}{spec['key']}", None)
    bpy.context.scene.collection.objects.link(root)
    r = 0.32                 # 머리 반지름 (세로로 살짝 긴 타원)
    f = r / 0.4              # 얼굴 부품 크기 비율
    leg_h = 0.36             # 땅 ~ 엉덩이
    torso_h = 0.41           # 엉덩이 ~ 어깨
    torso_top = leg_h + torso_h
    neck_h = 0.06
    hz = torso_top + neck_h + r * HEAD_SCALE[2] * 0.86  # 짧은 목 위에 얹힘

    # 신발 (크고 둥근 운동화 + 흰 밑창)
    for s in (-1, 1):
        add("신발", sphere_bm(0.068, (s * 0.07, -0.03, 0.05), (1.0, 1.55, 0.72)), spec["shoes"], root)
        add("밑창", sphere_bm(0.07, (s * 0.07, -0.03, 0.026), (1.03, 1.58, 0.33)), "#f5efe6", root)
        # 가는 다리 (곧은 원통)
        add("다리", rcyl(0.03, 0.033, 0.28, (s * 0.07, 0, 0.2), bevel=0.01, segs=16), SKIN, root)

    # 하의
    if spec["bottom"] == "shorts":
        add("반바지", rcyl(0.13, 0.125, 0.09, (0, 0, leg_h + 0.025), bevel=0.03, sy=0.78), spec["bottom_col"], root)
        for s in (-1, 1):
            add("바짓단", rcyl(0.066, 0.062, 0.13, (s * 0.068, 0, leg_h - 0.06), bevel=0.012, segs=24, top=False),
                spec["bottom_col"], root)
    else:
        # 치마 윗부분은 티셔츠 안으로 들어가게 (앞뒤로 납작하게 맞춤)
        sk = tube_bm(0.2, 0.11, 0.22, (0, 0, leg_h - 0.01), segs=48)
        bmesh.ops.scale(sk, vec=Vector((1, 0.82, 1)), verts=sk.verts)
        add("치마", sk, spec["bottom_col"], root, solid=0.02, subsurf=1)

    # 상의: 반팔 티셔츠 (아래가 살짝 넓은 원통, 어깨는 둥글게)
    add("상의", rcyl(0.15, 0.13, torso_h - 0.02, (0, 0, leg_h + 0.02 + (torso_h - 0.02) / 2), bevel=0.045, sy=0.74),
        spec["top"], root)
    # 목
    add("목", rcyl(0.042, 0.042, neck_h + 0.05, (0, 0, torso_top + neck_h / 2), bevel=0.0, segs=20), SKIN, root)
    for s in (-1, 1):
        rot_s = Matrix.Rotation(-s * 0.42, 4, "Y")
        sl = rcyl(0.058, 0.05, 0.1, (0, 0, -0.04), bevel=0.012, segs=24, top=True, bottom=True)
        bmesh.ops.transform(sl, matrix=rot_s, verts=sl.verts)
        bmesh.ops.translate(sl, vec=Vector((s * 0.15, 0, torso_top - 0.045)), verts=sl.verts)
        add("소매", sl, spec["top"], root)
        # 가는 팔이 허리 아래까지 + 큰 주먹손
        rot = Matrix.Rotation(-s * 0.3, 4, "Y")
        sh = Vector((s * 0.165, 0, torso_top - 0.07))
        arm = rcyl(0.028, 0.032, 0.25, (0, 0, -0.13), bevel=0.0, segs=16)
        bmesh.ops.transform(arm, matrix=rot, verts=arm.verts)
        bmesh.ops.translate(arm, vec=sh, verts=arm.verts)
        add("팔", arm, SKIN, root)
        add("손", sphere_bm(0.062, sh + rot.to_3x3() @ Vector((0, 0, -0.29))), SKIN, root)

    # 머리와 귀
    add("머리", sphere_bm(r, (0, 0, hz), HEAD_SCALE, segs=64, rings=36), SKIN, root)
    for s in (-1, 1):
        add("귀", sphere_bm(0.07 * f, (s * r * 0.97, 0.02, hz - 0.07 * f), (0.5, 0.75, 1.0)), SKIN, root)

    # 눈: 크고 머리 가운데보다 살짝 아래
    ex, ez = 0.17 * f, hz - 0.05 * f
    for s in (-1, 1):
        cx = s * ex
        add("흰자", sphere_bm(0.105 * f, on_face(r, hz, cx, ez, out=-0.016 * f), (0.82, 0.3, 1.0)),
            "#fffaf2", root, emit=True)
        add("눈동자", sphere_bm(0.078 * f, on_face(r, hz, cx - s * 0.008 * f, ez - 0.006 * f, out=-0.003 * f),
            (0.82, 0.3, 1.0)), spec["iris"], root, emit=True)
        add("동공", sphere_bm(0.044 * f, on_face(r, hz, cx - s * 0.008 * f, ez - 0.006 * f, out=0.014 * f),
            (0.82, 0.3, 1.0)), "#1f1714", root, emit=True)
        add("반짝", sphere_bm(0.023 * f, on_face(r, hz, cx + 0.022 * f, ez + 0.032 * f, out=0.026 * f),
            (1, 0.4, 1)), "#ffffff", root, emit=True)
        if spec.get("lash"):
            lp = on_face(r, hz, cx + s * 0.075 * f, ez + 0.055 * f, out=-0.004 * f)
            b = sphere_bm(0.025 * f, (0, 0, 0), (1.5, 0.4, 0.5))
            bmesh.ops.transform(b, matrix=Matrix.Rotation(-s * 0.55, 4, "Y"), verts=b.verts)
            bmesh.ops.translate(b, vec=lp, verts=b.verts)
            add("속눈썹", b, "#2b1d18", root, emit=True)
        add("볼", sphere_bm(0.075 * f, on_face(r, hz, s * 0.24 * f, hz - 0.15 * f, out=-0.022 * f), (1.15, 0.3, 0.8)),
            "#ff9f90", root, emit=True)

    # 코와 입
    add("코", sphere_bm(0.036 * f, on_face(r, hz, 0, hz - 0.12 * f, out=0.008 * f), (1.15, 0.85, 0.95)),
        "#ff9a78", root)
    smile(r, hz - 0.02 * f, f, root)

    hair_cap(r, hz, f, spec, root)

    root.location.x = x
    return root


# ───────────── 장면 ─────────────
def setup_scene():
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.resolution_x = 640
    sc.render.resolution_y = 880
    sc.render.film_transparent = False
    try:
        sc.eevee.taa_render_samples = 48
    except AttributeError:
        pass

    w = sc.world or bpy.data.worlds.new(PREFIX + "world")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    sky = nt.nodes.new("ShaderNodeBackground")
    sky.inputs["Color"].default_value = lin("#d6eefc")
    amb = nt.nodes.new("ShaderNodeBackground")
    amb.inputs["Color"].default_value = (0.9, 0.92, 1.0, 1)
    amb.inputs["Strength"].default_value = 0.65
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(amb.outputs[0], mix.inputs[1])
    nt.links.new(sky.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])

    ground = bmesh.new()
    bmesh.ops.create_cone(ground, cap_ends=True, segments=64, radius1=40, radius2=40, depth=0.1)
    bmesh.ops.translate(ground, vec=Vector((0, 0, -0.05)), verts=ground.verts)
    add("땅", ground, "#9bd67a", None, rim=0.0)

    ld = bpy.data.lights.new(PREFIX + "해", "SUN")
    ld.energy = 3.3
    ld.color = (1.0, 0.95, 0.87)
    ld.angle = math.radians(10)
    sun = bpy.data.objects.new(PREFIX + "해", ld)
    sc.collection.objects.link(sun)
    sun.rotation_euler = Vector((0.5, 0.8, -1.0)).to_track_quat("-Z", "Y").to_euler()

    cd = bpy.data.cameras.new(PREFIX + "카메라")
    cd.type = "ORTHO"
    cd.ortho_scale = 1.9
    cam = bpy.data.objects.new(PREFIX + "카메라", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def aim(cam, x):
    target = Vector((x, 0, 0.79))
    cam.location = target + Vector((0, -10, 2.4))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()


# ───────────── 실행 ─────────────
clean()
_mats.clear()
sc, cam = setup_scene()
roots = [build_char(spec, i * GAP) for i, spec in enumerate(CHARS)]

for name, deg in (("front", -18), ("back", 162)):
    for r_ in roots:
        r_.rotation_euler.z = math.radians(deg)
    for spec, r_ in zip(CHARS, roots):
        aim(cam, r_.location.x)
        sc.render.filepath = str(CARDS / f"{spec['key']}_{name}.png")
        bpy.ops.render.render(write_still=True)
for r_ in roots:
    r_.rotation_euler.z = math.radians(-18)

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "character_samples.blend"))
print("완료")
