use arch_kernel::{analytic_fixture,build,build_svg,write_stl};
fn main()->Result<(),Box<dyn std::error::Error>>{
    let args:Vec<String>=std::env::args().collect();
    if args.len()<4 {return Err("usage: arch-kernel analytic <fixture> <output-prefix> | svg <input.svg> <output-prefix> [thickness-mm] [long-edge-mm]".into());}
    let snapshot=match args[1].as_str(){
        "analytic"=>build(&analytic_fixture(&args[2])?,1)?,
        "svg"=>{
            let source=std::fs::read_to_string(&args[2])?;
            let thickness=args.get(4).map(|v|v.parse::<f64>()).transpose()?.unwrap_or(2.);
            let size=args.get(5).map(|v|v.parse::<f64>()).transpose()?;
            let result=build_svg(&source,thickness,size,0.004,1)?;
            std::fs::write(format!("{}.metadata.json",args[3]),serde_json::to_vec_pretty(&result.metadata())?)?;
            result.snapshot
        },_=>return Err("UNKNOWN_COMMAND".into())
    };
    std::fs::write(format!("{}.arch",args[3]),snapshot.bytes())?;
    let count=u32::from_le_bytes(snapshot.bytes()[28..32].try_into()?);
    for i in 0..count{std::fs::write(format!("{}.part-{}.stl",args[3],i),write_stl(&snapshot,i)?)?;}
    println!("{{\"parts\":{count},\"bytes\":{}}}",snapshot.bytes().len());Ok(())
}
