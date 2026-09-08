// Test inputs built through the production SVG ABI. No fixture-only exports,
// snapshot byte mutation, mesh JSON, custom Boolean or native allocator bypass.
export function productionSource(M,index,generation){
 const path=(d,fill='#ff0000')=>`<path fill="${fill}" fill-rule="evenodd" d="${d}"/>`;
 let body,height,width=40;
 switch(index){
  case 0: body=path('M0 0H10V10H0Z')+path('M5 0H15V10H5Z','#0000ff');height=10;break;
  case 1: body=path('M0 0H10V10H0Z')+path('M10 0H20V10H10Z','#0000ff');height=10;break;
  case 2: case 3: body=path('M0 0H20V10H0Z M8 3H12V7H8Z');height=4;break;
  case 7: body=path('M1 2H5V7H1Z');height=6;break;
  case 9: body=path('M9000 0H9001V1H9000Z')+path('M9001.00001 0H9002.00001V1H9001.00001Z','#0000ff');height=1;width=9500;break;
  case 12:body=path('M0 0H10V10H0Z')+path('M10 0H20V10H10Z','#0000ff')+path('M20 0H30V10H20Z');height=10;break;
  default:throw Error('Unsupported production analytic fixture '+index);
 }
 const source=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20">${body}</svg>`;
 const bytes=new TextEncoder().encode(source),input=M._arch_input_create(bytes.length);if(!input)throw Error('production source input');M.HEAPU8.set(bytes,M._arch_input_ptr(input));
 const id=M._arch_build_svg(input,height,width,.001,generation);
 if(!id)throw Error(new TextDecoder().decode(M.HEAPU8.subarray(M._arch_error_ptr(),M._arch_error_ptr()+M._arch_error_len())));
 return id;
}
