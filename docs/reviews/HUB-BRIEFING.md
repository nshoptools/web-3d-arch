# Cách Hub giao việc cho ghế review

## Vì sao có tài liệu này

Một bản giao việc mang sẵn phân tích của Hub sẽ biến ghế thành người **kiểm chứng
phân tích đó**. Ghế vẫn làm việc nghiêm túc, nhưng phần lớn công sức đi vào xác
nhận hoặc bác bỏ con đường Hub đã chọn, chứ không đi tìm con đường khác. Với vấn
đề Hub **chưa** giải được, đó là mất mát lớn nhất: thứ Hub cần chính là hướng mà
mình không nghĩ ra.

## Chọn loại việc trước khi viết prompt

Câu hỏi quyết định: **Hub đã có lời giải chưa?**

- **Đã có → phản biện.** Đưa mã, đưa số đo, và tự nêu những chỗ mình thấy dễ vỡ
  nhất để ghế đánh thẳng vào đó. Kèm ít nhất một câu cho phép ghế bác **cả hướng
  đi**, không chỉ bắt lỗi chi tiết. Đưa một **bản đông cứng** (diff hoặc bản chụp
  trong phòng phiên) chứ không để ghế đọc cây làm việc đang thay đổi; nếu Hub sửa
  tiếp trong lúc ghế đang đọc, bài phản biện sẽ lệch khỏi thứ đang có.
- **Chưa có → bài mở.** Đưa dữ kiện, **giữ lại** phân tích và hướng giải của
  mình, và **nói rõ trong prompt là đang cố ý giữ lại**. Câu hỏi trọng tâm là
  "bạn sẽ giải thế nào", nêu rõ được phép đề xuất cách khác hẳn cách hiện tại.

Trường hợp ở giữa: Hub **đã thử và thất bại**. Đó vẫn là bài mở. Bản vá hỏng và
chỗ nó chết là **dữ kiện** cần đưa; đừng biến nó thành hướng đề nghị ghế tiếp tục.

Trộn hai loại vào một prompt thì phần mở thường bị phần phản biện nuốt mất.

## Bài mở: đưa gì và giữ gì

**Đưa**: số liệu thô đọc thẳng từ tệp kết quả (mã lỗi, chỉ số, toạ độ, đường dẫn
bằng chứng); cách tái hiện trên máy này; ràng buộc bắt buộc; và **bản đối chứng**
chạy trên trạng thái chưa sửa — một commit hoặc bản chụp cụ thể — để ghế tự tách
lỗi có sẵn khỏi lỗi mới thay vì tin lời Hub.

**Giữ lại**: giả thuyết nguyên nhân của Hub, hướng sửa Hub định làm, và cách Hub
**diễn giải** số liệu. Ranh giới nằm ở chỗ đó: "mặt X là tường chung giữa hai
màu" đã là diễn giải; "mặt X và Y, part 1 và 2, màu A và B" là dữ kiện.

## Nên cân nhắc đưa thêm — chọn theo tình huống, không phải danh mục phải điền

- **Câu tự kiểm giả thuyết.** Buộc ghế kiểm quy luật của chính nó trên phần dữ
  liệu **không** hỏng, và dựng ca mới nếu quy luật đó dự đoán thêm ca hỏng.
- **Một ô mở**: còn gì chưa được hỏi mà ghế thấy đáng lo hơn.
- **Những lần Hub đã đoán sai**, kèm lời dặn đừng đi lại. Tiết kiệm công của ghế
  và tránh nhận về đúng ngõ cụt cũ.
- **Phần Hub chưa chạy**, nói thẳng là chưa chạy. Để trống sẽ bị hiểu là đã chạy
  và đã đạt.
- **Phản bác của Hub đối với phát hiện trước đó của chính ghế đó**, kèm bằng
  chứng, để ghế có cơ hội bác ngược lại Hub.

## Bổn phận phân xử của Hub

Kết quả của ghế là **bằng chứng, không phải phán quyết**. Hub **tự tái hiện**
trước khi nhận một phát hiện, và **tự đo** trước khi bác một phát hiện; không
nhận và không bác theo uy tín của ghế.

Khi Hub **không tái hiện được** — thiếu thiết bị, thiếu phần mềm, thiếu quyền —
thì ghi đúng như vậy: chưa xác minh, kèm lý do. Không xếp nó thành đã nhận, cũng
không xếp thành đã bác.

Hai ghế mâu thuẫn nhau không có nghĩa một bên sai. Thường mỗi bên đúng về một
phạm vi khác nhau, và việc của Hub là chỉ ra phạm vi đó thay vì chọn phe. Ghi
phân xử kèm bằng chứng, gồm cả phát hiện bị bác và lý do bác.

Hai ghế **trùng kết luận** là bằng chứng mạnh — nhưng **chỉ khi chúng thật sự độc
lập**. Nếu prompt đã nêu sẵn hướng của Hub, hoặc ghế đã đọc kết luận của ghế kia,
thì trùng nhau chẳng nói lên điều gì ngoài việc cả hai đọc cùng một gợi ý. Đó là
lý do thứ hai để giữ lại phân tích của mình, ngoài lý do ở đầu tài liệu.

## Không biến tài liệu này thành biểu mẫu

Đây là nguyên tắc và lý do, không phải khuôn điền. Prompt càng quy định chi tiết
cách làm, đường suy luận của ghế càng hẹp, và thứ Hub nhận về càng giống thứ Hub
đã nghĩ sẵn. Khi phân vân giữa nói thêm cho rõ và để ngỏ cho ghế tự tìm: nói rõ
**ràng buộc và dữ kiện**, để ngỏ **cách giải**.

## Không thay thế quy tắc nào đang có

[AGENTS.md](../../AGENTS.md) và [hướng dẫn phòng review](../../tmp/reviews/README.md)
giữ nguyên hiệu lực: mỗi ghế chỉ ghi trong phòng mình, tự kết luận trước khi đọc
kết luận ghế khác, nộp theo [mẫu báo cáo](REVIEW-TEMPLATE.md), cấu hình
model/effort theo [SEAT-CONFIG.md](SEAT-CONFIG.md). Không nới lỏng phép kiểm để
đạt kết quả xanh. Không giả lập phản hồi của ghế: nếu không gọi được một ghế,
phải nêu rõ và **không** coi yêu cầu phản biện bắt buộc là đã hoàn tất.

## Xuất xứ

Rút ra từ đợt 2026-09-10, sau khi chủ dự án chỉ ra rằng prompt của Hub đang neo
hai ghế vào lời giải của Hub. Bốn kết quả trong cùng đợt:

- Hub giữ kín một phỏng đoán của mình về nguyên nhân; **cả hai ghế độc lập kết
  luận ngược lại**, mỗi bên bằng một đường riêng. Nếu phỏng đoán đó nằm trong
  prompt, nhiều khả năng Hub đã nhận về tiếng vọng.
- Vòng **phản biện** tìm ra một lỗ P0 trong bản sửa của Hub — bản sửa cấp kết quả
  đạt cho hai khối vật liệu giao nhau. Hub tự tái hiện lại được bằng ca dựng của
  chính mình, gỡ hai phần gây lỗi và ghim ca phản chứng thành ca kiểm.
- Một ghế **tự rút lại** phát hiện của chính mình sau khi Hub đưa bằng chứng đo
  được, vì Hub đã đưa phần phản bác đó vào prompt vòng sau.
- Một **bài mở** tìm ra nguyên nhân gốc mà cả Hub lẫn ghế còn lại đều không thấy.

Bằng chứng nằm trong phòng phiên của đợt đó, không nằm trong Git.
