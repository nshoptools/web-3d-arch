/** Fixed public Vietnamese messages for project load/save outcomes; never forward a raw storage error body. */
export const PROJECT_MESSAGES=Object.freeze({
 CONFLICT:'Dự án này vừa được thay đổi ở một tab hoặc cửa sổ khác nên thay đổi hiện tại chưa được lưu. Hãy mở lại dự án (project.open) để tiếp tục từ bản mới nhất.',
 RECOVERED_PREVIOUS:'Không đọc được bản lưu mới nhất của dự án; đã mở bản lưu trước đó. Bản mới nhất vẫn được giữ lại để khôi phục; lần lưu tiếp theo sẽ tiếp nối bản đã mở.',
 SUPERSEDED_GENERATION_RETAINED:'Đã lưu tiếp nối bản lưu trước đó. Bản lưu mới nhất không đọc được vẫn được giữ lại trong bộ nhớ cục bộ để khôi phục.',
 COMMIT_ACK_RECOVERED:'Đã xác minh bản lưu được ghi thành công sau một lần xác nhận không chắc chắn.',
 COMMIT_DURABLE_BEFORE_LOCK:'Thay đổi đã được lưu bền vững trước khi dự án bị khóa; trạng thái hiện tại phản ánh bản vừa lưu.',
 LIBRARY_READ_RETRY:'Chưa đọc được dự án này trong lần tải thư viện vừa rồi; sẽ thử lại ở lần tải tiếp theo.',
 PROJECT_READ_ONLY:'Dự án ở dạng chỉ đọc; dữ liệu được giữ nguyên và có thể xuất bản sao thô.',
 PROJECT_UNRECOVERABLE:'Không đọc được bản lưu nào của dự án; dữ liệu thô được giữ nguyên để xuất bản sao thô.',
 APP_DOCUMENT_VERSION:'Dự án được lưu bằng phiên bản ứng dụng chưa được hỗ trợ; dữ liệu được giữ nguyên để xuất bản sao thô.',
 UNSUPPORTED_HEAD_VERSION:'Bản ghi dự án dùng phiên bản lưu trữ chưa được hỗ trợ; dữ liệu được giữ nguyên để xuất bản sao thô.',
 UNSUPPORTED_MANIFEST_VERSION:'Bản ghi dự án dùng phiên bản lưu trữ chưa được hỗ trợ; dữ liệu được giữ nguyên để xuất bản sao thô.',
 UNSUPPORTED_DATABASE_VERSION:'Cơ sở dữ liệu cục bộ có phiên bản chưa được hỗ trợ; dự án chỉ đọc và có thể xuất bản sao thô.',
 PROJECT_UNRECOGNIZED:'Không nhận dạng được dự án này; dữ liệu được giữ nguyên và có thể xuất bản sao thô.',
 PACKAGE_PROJECT_EXISTS:'Dự án trong gói vẫn còn trong thư viện nên đã mở bản trong thư viện, không nhập lại từ gói. Muốn dùng đúng bản trong gói: xóa dự án trong thư viện rồi mở gói lần nữa.',
 PACKAGE_IMPORTED_AS_COPY:'Bản ghi cũ của dự án này không đọc được nên gói được mở thành bản sao có mã mới. Nguồn của bản sao cần được nhập lại (Thay bằng tệp khác) trước khi dựng mô hình.'
});
/** Human reason for a library row that could not be listed: transient reads are retried, stored-data problems are cached. */
export function libraryReason(code,transient){
 if(transient)return PROJECT_MESSAGES.LIBRARY_READ_RETRY;
 return Object.hasOwn(PROJECT_MESSAGES,code)?PROJECT_MESSAGES[code]:PROJECT_MESSAGES.PROJECT_UNRECOGNIZED;
}
