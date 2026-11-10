from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet

def generate_report(title, rows, destination):
    path=Path(destination); path.parent.mkdir(parents=True,exist_ok=True)
    styles=getSampleStyleSheet(); story=[Paragraph(title,styles["Title"]),Spacer(1,16),Paragraph("ECONOVA analytical export. Verify source, unit and reference period before interpretation.",styles["BodyText"]),Spacer(1,14)]
    data=[["Period","Value"]]+[[str(x["period"]),str(x["value"])] for x in rows]
    table=Table(data,repeatRows=1); table.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#10263b")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("GRID",(0,0),(-1,-1),.4,colors.grey),("PADDING",(0,0),(-1,-1),7)])); story.append(table)
    SimpleDocTemplate(str(path),pagesize=A4).build(story)
    return path
