// Pinned, unmodified catalog data. See docs/domain/catalog-provenance.json and docs/domain/decisions.md.
import { deepFreeze } from './safe.mjs';
export const CATALOG = deepFreeze({
  "schemaVersion": 2,
  "status": "audited-catalog-pending-semantic-validation",
  "fields": [
    {
      "id": "k",
      "nhom": "Màu & chi tiết",
      "nhan": "Số màu (số filament)",
      "kieu": "r",
      "donVi": null,
      "mien": [
        2,
        16
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": 4
    },
    {
      "id": "res",
      "nhom": "Màu & chi tiết",
      "nhan": "Độ phân giải xử lý",
      "kieu": "s",
      "donVi": null,
      "mien": [
        "360",
        "520",
        "720",
        "960",
        "1280"
      ],
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": "520"
    },
    {
      "id": "smooth",
      "nhom": "Màu & chi tiết",
      "nhan": "Làm phẳng mảng màu",
      "kieu": "r",
      "donVi": null,
      "mien": [
        0,
        6
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": 3
    },
    {
      "id": "minA",
      "nhom": "Màu & chi tiết",
      "nhan": "Gộp mảng vụn",
      "kieu": "r",
      "donVi": null,
      "mien": [
        0,
        100
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": 5
    },
    {
      "id": "denoise",
      "nhom": "Màu & chi tiết",
      "nhan": "Khử nhiễu ảnh",
      "kieu": "r",
      "donVi": null,
      "mien": [
        0,
        3
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": 1
    },
    {
      "id": "eps",
      "nhom": "Màu & chi tiết",
      "nhan": "Độ mượt đường viền",
      "kieu": "r",
      "donVi": null,
      "mien": [
        0,
        100
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": 35
    },
    {
      "id": "tension",
      "nhom": "Màu & chi tiết",
      "nhan": "Bo cong",
      "kieu": "r",
      "donVi": null,
      "mien": [
        0,
        100
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": 65
    },
    {
      "id": "size",
      "nhom": "Kích thước & dáng",
      "nhan": "Kích thước cạnh dài",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        12,
        160
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": 45
    },
    {
      "id": "outline",
      "nhom": "Kích thước & dáng",
      "nhan": "Kiểu đế",
      "kieu": "s",
      "donVi": null,
      "mien": [
        "silhouette",
        "round",
        "circle",
        "square"
      ],
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": "silhouette"
    },
    {
      "id": "cornerR",
      "nhom": "Kích thước & dáng",
      "nhan": "Bo góc khung",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        14
      ],
      "buoc": 0.5,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": 3
    },
    {
      "id": "offset",
      "nhom": "Kích thước & dáng",
      "nhan": "Giãn viền quanh hình",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        8
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": 1.5
    },
    {
      "id": "weld",
      "nhom": "Kích thước & dáng",
      "nhan": "Hàn chi tiết rời",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        5
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": 0.8
    },
    {
      "id": "minFeature",
      "nhom": "Kích thước & dáng",
      "nhan": "Chi tiết nhỏ nhất giữ lại",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.2,
        4
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": 0.6
    },
    {
      "id": "fillHoles",
      "nhom": "Kích thước & dáng",
      "nhan": "Lấp lỗ thủng bên trong đế",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": true
    },
    {
      "id": "topBevel",
      "nhom": "Kích thước & dáng",
      "nhan": "Bo mép trên — mặc định mọi khối",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": false
    },
    {
      "id": "topBevelR",
      "nhom": "Kích thước & dáng",
      "nhan": "Bán kính bo",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.2,
        3
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": 0.6
    },
    {
      "id": "topBevelShape",
      "nhom": "Kích thước & dáng",
      "nhan": "Kiểu bo",
      "kieu": "s",
      "donVi": null,
      "mien": [
        "tron",
        "vat",
        "bac"
      ],
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": "tron"
    },
    {
      "id": "bevelGop",
      "nhom": "Kích thước & dáng",
      "nhan": "Gộp các mảng rời trước khi bo",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": false
    },
    {
      "id": "bevelChu",
      "nhom": "Kích thước & dáng",
      "nhan": "Bo cả mép chữ (nét + đế chữ)",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": false
    },
    {
      "id": "topBevelSeg",
      "nhom": "Kích thước & dáng",
      "nhan": "Số bậc bo",
      "kieu": "r",
      "donVi": "bậc",
      "mien": [
        1,
        12
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": 3
    },
    {
      "id": "layerH",
      "nhom": "Chiều cao",
      "nhan": "Chiều cao lớp in",
      "kieu": "s",
      "donVi": null,
      "mien": [
        "0.08",
        "0.10",
        "0.12",
        "0.16",
        "0.20",
        "0.24",
        "0.28",
        "0.30"
      ],
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": "0.20"
    },
    {
      "id": "layerStep",
      "nhom": "Chiều cao",
      "nhan": "Bước nhảy nhanh",
      "kieu": "r",
      "donVi": "lớp",
      "mien": [
        1,
        10
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": 3
    },
    {
      "id": "baseH",
      "nhom": "Chiều cao",
      "nhan": "Dày đế / thân",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.6,
        24
      ],
      "buoc": 0.2,
      "bamLopIn": true,
      "nangCao": false,
      "apChoLoai": [
        "keychain",
        "strap",
        "lego",
        "charm"
      ],
      "macDinh": 2.4
    },
    {
      "id": "plateT",
      "nhom": "Chiều cao",
      "nhan": "Dày mặt cap",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.8,
        5
      ],
      "buoc": 0.2,
      "bamLopIn": true,
      "nangCao": false,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 1.6
    },
    {
      "id": "artMode",
      "nhom": "Chiều cao",
      "nhan": "Kiểu hoạ tiết",
      "kieu": "s",
      "donVi": null,
      "mien": [
        "noi",
        "chim",
        "phang",
        "phang2"
      ],
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": "noi"
    },
    {
      "id": "flatTop",
      "nhom": "Chiều cao",
      "nhan": "Dày lớp màu ở mặt trên",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.2,
        6
      ],
      "buoc": 0.1,
      "bamLopIn": true,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": 1
    },
    {
      "id": "artH",
      "nhom": "Chiều cao",
      "nhan": "Cao hoạ tiết",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.2,
        6
      ],
      "buoc": 0.1,
      "bamLopIn": true,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": 0.8
    },
    {
      "id": "rimOn",
      "nhom": "Chiều cao",
      "nhan": "Lớp nền màu riêng dưới hoạ tiết (mặc định trắng)",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain",
        "strap",
        "charm"
      ],
      "macDinh": false
    },
    {
      "id": "rimH",
      "nhom": "Chiều cao",
      "nhan": "Dày lớp nền viền",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.2,
        6
      ],
      "buoc": 0.1,
      "bamLopIn": true,
      "nangCao": false,
      "apChoLoai": [
        "keychain",
        "strap",
        "charm"
      ],
      "macDinh": 0.6
    },
    {
      "id": "splitObj",
      "nhom": "Chiều cao",
      "nhan": "Tách chiều cao theo từng đối tượng",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": "tất cả",
      "macDinh": true
    },
    {
      "id": "layerBand",
      "nhom": "Chiều cao",
      "nhan": "Tách màu theo tầng cao (in nhanh, đỡ tốn nhựa)",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": false
    },
    {
      "id": "bandCore",
      "nhom": "Chiều cao",
      "nhan": "Đổ lõi bằng màu đế (tiết kiệm tối đa)",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": false
    },
    {
      "id": "bandCap",
      "nhom": "Chiều cao",
      "nhan": "Dày lớp màu trên cùng khi đổ lõi",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.2,
        3
      ],
      "buoc": 0.1,
      "bamLopIn": true,
      "nangCao": false,
      "apChoLoai": "tất cả",
      "macDinh": 0.6
    },
    {
      "id": "ringOn",
      "nhom": "Lỗ móc khoá",
      "nhan": "Có lỗ xỏ móc",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": true
    },
    {
      "id": "ringOuterD",
      "nhom": "Lỗ móc khoá",
      "nhan": "Ø gờ ngoài",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        4,
        18
      ],
      "buoc": 0.5,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 8
    },
    {
      "id": "ringInnerD",
      "nhom": "Lỗ móc khoá",
      "nhan": "Ø lỗ",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        1.5,
        10
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 4
    },
    {
      "id": "ringTren",
      "nhom": "Lỗ móc khoá",
      "nhan": "Gắn lỗ móc vào",
      "kieu": "s",
      "donVi": null,
      "mien": [
        "hinh",
        "chu"
      ],
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": "hinh"
    },
    {
      "id": "ringAngle",
      "nhom": "Lỗ móc khoá",
      "nhan": "Vị trí quanh hình",
      "kieu": "r",
      "donVi": "°",
      "mien": [
        0,
        360
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 90
    },
    {
      "id": "ringOverlap",
      "nhom": "Lỗ móc khoá",
      "nhan": "Chồng vào thân",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        10
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 1.5
    },
    {
      "id": "ringH",
      "nhom": "Lỗ móc khoá",
      "nhan": "Cao gờ móc",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        24
      ],
      "buoc": 0.2,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 0
    },
    {
      "id": "legoOn",
      "nhom": "Ngàm Lego",
      "nhan": "Đục lỗ cắm ở mặt dưới",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": true
    },
    {
      "id": "legoPitch",
      "nhom": "Ngàm Lego",
      "nhan": "Khoảng cách tâm lỗ",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        4,
        32
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 8
    },
    {
      "id": "legoHoleD",
      "nhom": "Ngàm Lego",
      "nhan": "Ø lỗ cắm",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        1,
        12
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 4.9
    },
    {
      "id": "legoHoleH",
      "nhom": "Ngàm Lego",
      "nhan": "Sâu lỗ cắm",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.4,
        6
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 1.8
    },
    {
      "id": "legoThua",
      "nhom": "Ngàm Lego",
      "nhan": "Giản lược lỗ",
      "kieu": "s",
      "donVi": null,
      "mien": [
        "du",
        "nua",
        "tu"
      ],
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": "du"
    },
    {
      "id": "legoHoDu",
      "nhom": "Ngàm Lego",
      "nhan": "Khe hở lỗ giản lược",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        1.5
      ],
      "buoc": 0.05,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 0.3
    },
    {
      "id": "legoWall",
      "nhom": "Ngàm Lego",
      "nhan": "Dày thành quanh lỗ",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.4,
        4
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 0.8
    },
    {
      "id": "legoRong",
      "nhom": "Ngàm Lego",
      "nhan": "Khoét rỗng đế, chỉ giữ thành quanh lỗ",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": false
    },
    {
      "id": "legoOffX",
      "nhom": "Ngàm Lego",
      "nhan": "Dời lưới lỗ ngang",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        -20,
        20
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 0
    },
    {
      "id": "legoOffY",
      "nhom": "Ngàm Lego",
      "nhan": "Dời lưới lỗ dọc",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        -20,
        20
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 0
    },
    {
      "id": "legoXeOn",
      "nhom": "Ngàm Lego",
      "nhan": "Xẻ rãnh chữ thập quanh lỗ",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": false
    },
    {
      "id": "legoXeW",
      "nhom": "Ngàm Lego",
      "nhan": "Bề rộng rãnh xẻ",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.2,
        2
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 0.6
    },
    {
      "id": "legoTaiOn",
      "nhom": "Ngàm Lego",
      "nhan": "Tai gióng bẻ bỏ",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": false
    },
    {
      "id": "legoTaiW",
      "nhom": "Ngàm Lego",
      "nhan": "Bề rộng tai",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.6,
        6
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 2.4
    },
    {
      "id": "legoTaiL",
      "nhom": "Ngàm Lego",
      "nhan": "Chiều dài tai",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        3,
        30
      ],
      "buoc": 0.5,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 12
    },
    {
      "id": "legoTaiCo",
      "nhom": "Ngàm Lego",
      "nhan": "Bề rộng cổ tai",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.4,
        3
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 1.2
    },
    {
      "id": "legoRanhOn",
      "nhom": "Ngàm Lego",
      "nhan": "Rãnh bán nguyệt quanh viền",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": true
    },
    {
      "id": "legoRanhR",
      "nhom": "Ngàm Lego",
      "nhan": "Bán kính rãnh",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.2,
        3
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 0.8
    },
    {
      "id": "legoRanhZ",
      "nhom": "Ngàm Lego",
      "nhan": "Cao độ tâm rãnh",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        20
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "lego"
      ],
      "macDinh": 0
    },
    {
      "id": "charmGan",
      "nhom": "Charm dép",
      "nhan": "Kiểu gắn",
      "kieu": "s",
      "donVi": null,
      "mien": [
        "roi",
        "lien"
      ],
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": "roi"
    },
    {
      "id": "charmCoD",
      "nhom": "Charm dép",
      "nhan": "Ø cổ (đi qua lỗ dép)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        4,
        24
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": 12.5
    },
    {
      "id": "charmCoH",
      "nhom": "Charm dép",
      "nhan": "Cao cổ (= dày quai dép)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.6,
        12
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": 3
    },
    {
      "id": "charmVanhD",
      "nhom": "Charm dép",
      "nhan": "Ø vành chặn",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        5,
        28
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": 14.5
    },
    {
      "id": "charmVanhH",
      "nhom": "Charm dép",
      "nhan": "Dày vành chặn",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.4,
        6
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": 1.6
    },
    {
      "id": "charmVat",
      "nhom": "Charm dép",
      "nhan": "Vát dẫn hướng mép vành",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        3
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": 0.8
    },
    {
      "id": "charmChotD",
      "nhom": "Charm dép",
      "nhan": "Ø chốt cắm",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        2,
        20
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": 6
    },
    {
      "id": "charmChotH",
      "nhom": "Charm dép",
      "nhan": "Sâu chốt / ổ",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.6,
        8
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": 2
    },
    {
      "id": "charmClr",
      "nhom": "Charm dép",
      "nhan": "Dung sai ổ – chốt",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        0.8
      ],
      "buoc": 0.05,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": 0.2
    },
    {
      "id": "charmRap",
      "nhom": "Charm dép",
      "nhan": "Xem ở trạng thái lắp ráp",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": false
    },
    {
      "id": "charmOffX",
      "nhom": "Charm dép",
      "nhan": "Dời nút ngang (X)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        -60,
        60
      ],
      "buoc": 0.5,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": 0
    },
    {
      "id": "charmOffY",
      "nhom": "Charm dép",
      "nhan": "Dời nút dọc (Y)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        -60,
        60
      ],
      "buoc": 0.5,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "charm"
      ],
      "macDinh": 0
    },
    {
      "id": "strapD",
      "nhom": "Lỗ luồn dây đeo",
      "nhan": "Ø lỗ luồn dây",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        2,
        12
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "strap"
      ],
      "macDinh": 4
    },
    {
      "id": "strapAngle",
      "nhom": "Lỗ luồn dây đeo",
      "nhan": "Góc ống lỗ",
      "kieu": "r",
      "donVi": "°",
      "mien": [
        0,
        180
      ],
      "buoc": 5,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "strap"
      ],
      "macDinh": 0
    },
    {
      "id": "strapZ",
      "nhom": "Lỗ luồn dây đeo",
      "nhan": "Cao độ tâm lỗ",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        1,
        20
      ],
      "buoc": 0.2,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "strap"
      ],
      "macDinh": 5
    },
    {
      "id": "strapOff",
      "nhom": "Lỗ luồn dây đeo",
      "nhan": "Dời lỗ khỏi tâm",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        -30,
        30
      ],
      "buoc": 0.5,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "strap"
      ],
      "macDinh": 0
    },
    {
      "id": "strapSlot",
      "nhom": "Lỗ luồn dây đeo",
      "nhan": "Kéo dài lỗ (slot)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        24
      ],
      "buoc": 0.5,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "strap"
      ],
      "macDinh": 0
    },
    {
      "id": "strapSlotDir",
      "nhom": "Lỗ luồn dây đeo",
      "nhan": "Hướng kéo dài",
      "kieu": "s",
      "donVi": null,
      "mien": [
        "ngang",
        "doc"
      ],
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "strap"
      ],
      "macDinh": "ngang"
    },
    {
      "id": "strapCham",
      "nhom": "Lỗ luồn dây đeo",
      "nhan": "Vát mép lỗ",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        2
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "strap"
      ],
      "macDinh": 0.6
    },
    {
      "id": "strapSeg",
      "nhom": "Lỗ luồn dây đeo",
      "nhan": "Độ mịn thành lỗ",
      "kieu": "r",
      "donVi": "cạnh",
      "mien": [
        6,
        40
      ],
      "buoc": 2,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "strap"
      ],
      "macDinh": 18
    },
    {
      "id": "rotObj",
      "nhom": "Lỗ luồn dây đeo",
      "nhan": "Xoay cả vật",
      "kieu": "r",
      "donVi": "°",
      "mien": [
        0,
        355
      ],
      "buoc": 5,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "strap"
      ],
      "macDinh": 0
    },
    {
      "id": "skirtH",
      "nhom": "Thân clicky",
      "nhan": "Cao váy cap",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        16
      ],
      "buoc": 0.5,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 0
    },
    {
      "id": "wallT",
      "nhom": "Thân clicky",
      "nhan": "Dày thành",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.6,
        4
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 1.6
    },
    {
      "id": "rib",
      "nhom": "Thân clicky",
      "nhan": "Gân gia cố",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        4
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 1.2
    },
    {
      "id": "crossL",
      "nhom": "Trụ cắm MX",
      "nhan": "Dài nhánh chữ thập",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        3,
        6
      ],
      "buoc": 0.05,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 4.1
    },
    {
      "id": "crossW",
      "nhom": "Trụ cắm MX",
      "nhan": "Rộng nhánh",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.8,
        2
      ],
      "buoc": 0.01,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 1.35
    },
    {
      "id": "clr",
      "nhom": "Trụ cắm MX",
      "nhan": "Dung sai (nới hốc)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        0.4
      ],
      "buoc": 0.01,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 0.05
    },
    {
      "id": "socketD",
      "nhom": "Trụ cắm MX",
      "nhan": "Sâu hốc chữ thập",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        2,
        9
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 5.5
    },
    {
      "id": "postH",
      "nhom": "Trụ cắm MX",
      "nhan": "Cao trụ",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        3,
        12
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 7
    },
    {
      "id": "postD1",
      "nhom": "Trụ cắm MX",
      "nhan": "Ø thân trụ",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        4,
        10
      ],
      "buoc": 0.05,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 5.7
    },
    {
      "id": "postD2",
      "nhom": "Trụ cắm MX",
      "nhan": "Ø cổ trụ (sát mặt cap)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        4,
        11
      ],
      "buoc": 0.05,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 6
    },
    {
      "id": "collarH",
      "nhom": "Trụ cắm MX",
      "nhan": "Cao cổ trụ",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        5
      ],
      "buoc": 0.05,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 1.85
    },
    {
      "id": "stemH",
      "nhom": "Trụ cắm MX",
      "nhan": "Chốt nhô trên MẶT switch",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        1,
        12
      ],
      "buoc": 0.05,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 3.6
    },
    {
      "id": "linkBody",
      "nhom": "Khay lắp switch",
      "nhan": "Váy, trụ cắm và đế thân dùng chung một màu",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": true
    },
    {
      "id": "housing",
      "nhom": "Khay lắp switch",
      "nhan": "In kèm khay lắp switch",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": true
    },
    {
      "id": "autoSize",
      "nhom": "Khay lắp switch",
      "nhan": "Tự tăng kích thước cho vừa switch",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": true
    },
    {
      "id": "plateHole",
      "nhom": "Khay lắp switch",
      "nhan": "Hốc thân switch",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        13.2,
        15.5
      ],
      "buoc": 0.05,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 14.05
    },
    {
      "id": "hSocketD",
      "nhom": "Khay lắp switch",
      "nhan": "Sâu hốc thân",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        3,
        9
      ],
      "buoc": 0.05,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 5.15
    },
    {
      "id": "hMouth",
      "nhom": "Khay lắp switch",
      "nhan": "Miệng hốc (đỡ vai)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        14.5,
        20
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 15.4
    },
    {
      "id": "hRecess",
      "nhom": "Khay lắp switch",
      "nhan": "Chìm switch xuống",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        1.5,
        10
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 2
    },
    {
      "id": "pinW",
      "nhom": "Khay lắp switch",
      "nhan": "Hốc chân switch",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        8,
        14
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 11.5
    },
    {
      "id": "pinD",
      "nhom": "Khay lắp switch",
      "nhan": "Sâu hốc chân",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.5,
        6
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 1.7
    },
    {
      "id": "hFloor",
      "nhom": "Khay lắp switch",
      "nhan": "Dày đáy khay (kín)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.8,
        6
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 1.5
    },
    {
      "id": "hWall",
      "nhom": "Khay lắp switch",
      "nhan": "Dày vách bao (chặn mặt cap)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        1,
        6
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 2
    },
    {
      "id": "hBossW",
      "nhom": "Khay lắp switch",
      "nhan": "Dày vách quanh hốc",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        1,
        6
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 2
    },
    {
      "id": "gap",
      "nhom": "Khay lắp switch",
      "nhan": "Khe hở cap ↔ vách",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.05,
        0.8
      ],
      "buoc": 0.05,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 0.25
    },
    {
      "id": "rimOver",
      "nhom": "Khay lắp switch",
      "nhan": "Vách bao cao/thấp hơn mặt cap",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        -10,
        6
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 0
    },
    {
      "id": "travel",
      "nhom": "Khay lắp switch",
      "nhan": "Hành trình nhấn",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        2,
        8
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 4.2
    },
    {
      "id": "hStopOn",
      "nhom": "Khay lắp switch",
      "nhan": "Gờ chặn cuối hành trình (chống nghiêng)",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": true
    },
    {
      "id": "hStopW",
      "nhom": "Khay lắp switch",
      "nhan": "Rộng gờ chặn",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.4,
        4
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 1.5
    },
    {
      "id": "hRingOn",
      "nhom": "Khay lắp switch",
      "nhan": "Có móc treo trên khay",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": false
    },
    {
      "id": "hRingH",
      "nhom": "Khay lắp switch",
      "nhan": "Cao gờ móc",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        1,
        30
      ],
      "buoc": 0.5,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 6
    },
    {
      "id": "hRingOuterD",
      "nhom": "Khay lắp switch",
      "nhan": "Ø gờ móc (khay)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        4,
        18
      ],
      "buoc": 0.5,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 8
    },
    {
      "id": "hRingInnerD",
      "nhom": "Khay lắp switch",
      "nhan": "Ø lỗ móc (khay)",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        1.5,
        10
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 4
    },
    {
      "id": "hRingAngle",
      "nhom": "Khay lắp switch",
      "nhan": "Vị trí móc (khay)",
      "kieu": "r",
      "donVi": "°",
      "mien": [
        0,
        360
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 90
    },
    {
      "id": "hRingOverlap",
      "nhom": "Khay lắp switch",
      "nhan": "Chồng vào vành",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0,
        10
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": 1.5
    },
    {
      "id": "assemble",
      "nhom": "Khay lắp switch",
      "nhan": "Xem ở trạng thái lắp ráp",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "clicky"
      ],
      "macDinh": false
    },
    {
      "id": "impOn",
      "nhom": "Khối nhập thêm",
      "nhan": "Nhập một khối STL/OBJ rồi ghép vào",
      "kieu": "c",
      "donVi": null,
      "mien": null,
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": false
    },
    {
      "id": "impOp",
      "nhom": "Khối nhập thêm",
      "nhan": "Cách ghép",
      "kieu": "s",
      "donVi": null,
      "mien": [
        "them",
        "han",
        "tru"
      ],
      "buoc": null,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": "them"
    },
    {
      "id": "impScale",
      "nhom": "Khối nhập thêm",
      "nhan": "Tỉ lệ",
      "kieu": "r",
      "donVi": "%",
      "mien": [
        1,
        400
      ],
      "buoc": 0.5,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 100
    },
    {
      "id": "impX",
      "nhom": "Khối nhập thêm",
      "nhan": "Dời ngang X",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        -80,
        80
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 0
    },
    {
      "id": "impY",
      "nhom": "Khối nhập thêm",
      "nhan": "Dời dọc Y",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        -80,
        80
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 0
    },
    {
      "id": "impZ",
      "nhom": "Khối nhập thêm",
      "nhan": "Dời cao Z",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        -60,
        60
      ],
      "buoc": 0.1,
      "bamLopIn": false,
      "nangCao": false,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 0
    },
    {
      "id": "impRX",
      "nhom": "Khối nhập thêm",
      "nhan": "Xoay quanh X",
      "kieu": "r",
      "donVi": "°",
      "mien": [
        0,
        355
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 0
    },
    {
      "id": "impRY",
      "nhom": "Khối nhập thêm",
      "nhan": "Xoay quanh Y",
      "kieu": "r",
      "donVi": "°",
      "mien": [
        0,
        355
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 0
    },
    {
      "id": "impRZ",
      "nhom": "Khối nhập thêm",
      "nhan": "Xoay quanh Z",
      "kieu": "r",
      "donVi": "°",
      "mien": [
        0,
        355
      ],
      "buoc": 1,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 0
    },
    {
      "id": "impVox",
      "nhom": "Khối nhập thêm",
      "nhan": "Ô lưới khi hàn/trừ",
      "kieu": "r",
      "donVi": "mm",
      "mien": [
        0.1,
        1
      ],
      "buoc": 0.05,
      "bamLopIn": false,
      "nangCao": true,
      "apChoLoai": [
        "keychain"
      ],
      "macDinh": 0.25
    }
  ],
  "modeDefaults": [
    {
      "mode": "keychain",
      "preset": {
        "size": 45,
        "outline": "silhouette",
        "offset": 1.5,
        "artMode": "noi",
        "artH": 0.8,
        "minFeature": 0.6,
        "baseH": 2.4
      }
    },
    {
      "mode": "clicky",
      "preset": {
        "size": 40,
        "outline": "silhouette",
        "offset": 1.2,
        "cornerR": 2.5,
        "artMode": "noi",
        "artH": 0.6,
        "minFeature": 0.6,
        "skirtH": 0
      }
    },
    {
      "mode": "strap",
      "preset": {
        "size": 40,
        "outline": "silhouette",
        "offset": 1.8,
        "artMode": "noi",
        "artH": 0.8,
        "minFeature": 0.6,
        "baseH": 10,
        "strapZ": 5,
        "strapD": 4,
        "strapCham": 0.6,
        "strapSlot": 0,
        "strapSlotDir": "ngang"
      }
    },
    {
      "mode": "lego",
      "preset": {
        "size": 45,
        "outline": "silhouette",
        "offset": 1.5,
        "artMode": "noi",
        "artH": 0.8,
        "minFeature": 0.6,
        "baseH": 5.6,
        "ringOn": false
      }
    },
    {
      "mode": "charm",
      "preset": {
        "size": 25,
        "outline": "silhouette",
        "offset": 1.5,
        "artMode": "noi",
        "artH": 0.8,
        "minFeature": 0.5,
        "baseH": 3,
        "ringOn": false
      }
    }
  ],
  "audit": {
    "fields": 126,
    "types": {
      "r": 94,
      "s": 10,
      "c": 22
    },
    "groups": {
      "Màu & chi tiết": 7,
      "Kích thước & dáng": 13,
      "Chiều cao": 13,
      "Lỗ móc khoá": 7,
      "Ngàm Lego": 19,
      "Charm dép": 12,
      "Lỗ luồn dây đeo": 9,
      "Thân clicky": 3,
      "Trụ cắm MX": 9,
      "Khay lắp switch": 24,
      "Khối nhập thêm": 10
    },
    "defaultIssues": [],
    "zPolicy": "bamLopIn is not a substitute for explicit heightMode, datum and the project layer schedule",
    "scope": "Only fields and modeDefaults included in this file; no external preset files"
  },
  "requiredCorrections": {
    "impVox": "replace with named mesh quality/tolerance capability; no unit-equivalent automatic migration",
    "strapSeg": "replace segment-count precision claim with bounded tessellation tolerance",
    "layerH": "parse enum as decimal mm; distinguish first-layer height",
    "clr": "Candidate 0.05 mm and intended UI increment 0.02 mm require an explicit grid/input/migration decision; preserve exact input",
    "ringH": "0 means auto only if explicit schema enum resolves it; do not produce zero-height solid"
  },
  "implementationGate": "O-02: validate dependencies, geometric constraints, auto sentinels, Z conversion, and replacement semantics before generate bindings",
  "catalogId": "parameters-core-v1",
  "catalogVersion": "1.0.1",
  "authority": "Permanent project parameter catalog; candidate dimensions require O-02/O-03 before implementation or fit claims",
  "fieldSchema": {
    "id": "Stable parameter identifier",
    "nhom": "Vietnamese group label",
    "nhan": "UI label",
    "kieu": {
      "r": "numeric range/slider",
      "c": "boolean checkbox",
      "s": "enum select"
    },
    "donVi": "Display/physical unit; null for dimensionless values",
    "mien": "Inclusive [min,max] for r; enum members for s; null for c (type is boolean)",
    "buoc": "Numeric increment relative to min for r; null if inapplicable",
    "macDinh": "Candidate default in the declared domain",
    "bamLopIn": "Candidate layer-alignment hint only; does not define heightMode or datum",
    "nangCao": "Advanced-UI visibility flag",
    "apChoLoai": "Literal tất cả for every product, or an array of product IDs from productIds; candidate applicability, subject to MOD-03/GEO-04"
  },
  "productIds": {
    "keychain": "Móc khóa",
    "clicky": "Keycap và khay switch",
    "strap": "Dây đeo",
    "lego": "Ngàm khối",
    "charm": "Charm cài dép"
  }
});
