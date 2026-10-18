import test from "node:test";
import assert from "node:assert/strict";
import { formatPayrollMoney, payrollSlipLanguage, renderPayrollSlipHtml } from "../src/lib/hrm/payroll.ts";

const fixture=()=>({policy:{title_en:"TEST issued policy",title_vi:"TEST Chính sách đã phát hành",legal_entity:"TEST & Co",currency:"USD",minor_unit_scale:2},period_key:"2026-10",starts_on:"2026-10-01",ends_on:"2026-10-31",employee_code:"TEST-E1",display_name:"TEST Employee",correction_of_payslip_id:"TEST-prior-slip",lines:[{title_en:"TEST salary",title_vi:"TEST Lương cơ bản",direction:"earning",amount_minor:123456,source_reference:"TEST INTERNAL PROOF MUST STAY PRIVATE"},{title_en:"TEST deduction",title_vi:"TEST Khấu trừ",direction:"deduction",amount_minor:456,source_reference:"TEST INTERNAL PROOF MUST STAY PRIVATE"}],gross_minor:123456,deductions_minor:456,net_minor:123000});

test("payslip download language is explicit, defaults to English, and rejects unsupported input",()=>{
 assert.equal(payrollSlipLanguage(null),"en");assert.equal(payrollSlipLanguage("en"),"en");assert.equal(payrollSlipLanguage("vi"),"vi");for(const value of ["","fr","VI","vi-VN","<script>"])assert.throws(()=>payrollSlipLanguage(value),{message:"payroll_language_invalid",status:400});
});
test("downloaded payslips use frozen translated titles and labels without changing snapshot data or exposing internal sources",()=>{
 const snapshot=fixture(),original=JSON.stringify(snapshot),en=renderPayrollSlipHtml(original,"en"),vi=renderPayrollSlipHtml(original,"vi");
 assert.ok(en.includes('<html lang="en">'));assert.ok(en.includes("TEST issued policy"));assert.ok(en.includes("USD 1,230.00"));assert.ok(en.includes("does not confirm payment or acceptance"));
 assert.ok(vi.includes('<html lang="vi">'));for(const value of ["TEST Chính sách đã phát hành","TEST Lương cơ bản","Kỳ lương","Thực nhận","Điều chỉnh cho phiếu","USD 1.230,00","không xác nhận đã trả lương"])assert.ok(vi.includes(value),value);
 assert.ok(!vi.includes("TEST issued policy"));assert.ok(!en.includes("TEST INTERNAL PROOF"));assert.ok(!vi.includes("TEST INTERNAL PROOF"));assert.equal(JSON.stringify(snapshot),original);
});
test("legacy Vietnamese downloads retain original missing translations with a notice and escape translated snapshot text",()=>{
 const snapshot=fixture();snapshot.policy.title_vi="";snapshot.lines[0].title_vi="";snapshot.lines[1].title_vi='<img src=x onerror="alert(1)">';snapshot.display_name='<script>alert("x")</script>';
 const html=renderPayrollSlipHtml(JSON.stringify(snapshot),"vi");assert.ok(html.includes("nội dung gốc được giữ nguyên"));assert.ok(html.includes("TEST issued policy"));assert.ok(html.includes("TEST salary"));assert.ok(html.includes("&lt;img"));assert.ok(!html.includes("<img src=x"));assert.ok(!html.includes("<script>"));
});
test("localized money formatting preserves maximum safe minor-unit integers and zero- and three-decimal currencies",()=>{
 assert.equal(formatPayrollMoney(Number.MAX_SAFE_INTEGER,"USD",2,"vi"),"USD 90.071.992.547.409,91");assert.equal(formatPayrollMoney(123456,"VND",0,"vi"),"VND 123.456");assert.equal(formatPayrollMoney(123456,"KWD",3,"vi"),"KWD 123,456");assert.equal(formatPayrollMoney(0,"USD",2,"vi"),"USD 0,00");assert.equal(formatPayrollMoney(123456,"USD",2),"USD 1,234.56");
});
